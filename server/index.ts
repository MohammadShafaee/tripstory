import ffmpeg from "@ffmpeg-installer/ffmpeg";
import cors from "cors";
import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import OpenAI from "openai";
import multer from "multer";

const PORT = Number(process.env.PORT ?? 4000);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.5";
const MAX_PHOTOS = 20;
const ROOT = process.cwd();
const UPLOAD_DIR = path.join(ROOT, "uploads");
const GENERATED_DIR = path.join(ROOT, "generated");

type StoryPayload = {
  title: string;
  narrative: string;
  sceneCaptions: string[];
};

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: MAX_PHOTOS
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }

    cb(new Error("Only image uploads are supported in this POC."));
  }
});

const app = express();
app.use(cors());
app.use("/generated", express.static(GENERATED_DIR));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/stories", upload.array("photos", MAX_PHOTOS), async (req, res, next) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    const tripName = String(req.body.tripName ?? "").trim();
    const tone = String(req.body.tone ?? "witty, observational").trim();

    if (!tripName) {
      res.status(400).send("Trip name is required.");
      return;
    }

    if (!files?.length) {
      res.status(400).send("Upload at least one photo.");
      return;
    }

    if (files.length > MAX_PHOTOS) {
      res.status(400).send(`Upload at most ${MAX_PHOTOS} photos.`);
      return;
    }

    const story = await createStory({ tripName, tone, files });
    const videoFileName = `${Date.now()}-${slugify(story.title)}.mp4`;
    const videoPath = path.join(GENERATED_DIR, videoFileName);

    await fs.mkdir(GENERATED_DIR, { recursive: true });
    await renderSlideshowVideo({
      files,
      outputPath: videoPath,
      story
    });

    res.json({
      title: story.title,
      narrative: story.narrative,
      videoUrl: `${PUBLIC_BASE_URL}/generated/${videoFileName}`
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).send(error.message || "Unexpected server error.");
});

async function createStory({
  files,
  tone,
  tripName
}: {
  files: Express.Multer.File[];
  tone: string;
  tripName: string;
}): Promise<StoryPayload> {
  if (process.env.USE_MOCK_AI === "true" || !process.env.OPENAI_API_KEY) {
    return createMockStory(tripName, tone, files.length);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const imageInputs = await Promise.all(
    files.map(async (file, index) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${file.mimetype};base64,${await fs.readFile(file.path, "base64")}`,
        detail: index < 6 ? ("high" as const) : ("low" as const)
      }
    }))
  );

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "You are Tripstory, an excellent travel essayist. You turn a small batch of trip photos into a vivid, truthful, short narrative. Do not invent specific names, dialogue, venues, or events unless visible in the photos. Write with a distinct voice, but keep it grounded.",
              `Trip name: ${tripName}`,
              `Desired voice: ${tone}`,
              "Write a title, a 450-700 word narrative, and 4-8 short scene captions for a vertical recap video.",
              "Return ONLY valid JSON with keys: title, narrative, sceneCaptions."
            ].join("\n")
          },
          ...imageInputs
        ]
      }
    ],
    response_format: { type: "json_object" }
  });

  const raw = response.choices[0]?.message.content || "{}";
  const parsed = JSON.parse(raw) as StoryPayload;
  return {
    title: parsed.title.trim(),
    narrative: parsed.narrative.trim(),
    sceneCaptions: parsed.sceneCaptions.map((caption) => caption.trim()).filter(Boolean)
  };
}

function createMockStory(tripName: string, tone: string, count: number): StoryPayload {
  return {
    title: `${tripName}: The First Draft of Yesterday`,
    narrative: [
      `This is a local mock because OPENAI_API_KEY is not set yet. Tripstory received ${count} photo${count === 1 ? "" : "s"} and is ready to send them to the AI once you add your key.`,
      `The requested voice is ${tone}. In the real run, this section becomes the polished account of the day: what the images suggest happened, how the mood changed, and which small visual details deserve to become the punchline.`,
      "For now, the app still proves the core loop: create a trip, pick photos, press one button, get a written story and a playable vertical video."
    ].join("\n\n"),
    sceneCaptions: [
      "The day begins with evidence.",
      "Small details start doing narrative work.",
      "The camera roll becomes a cast list.",
      "Yesterday gets a title."
    ]
  };
}

async function renderSlideshowVideo({
  files,
  outputPath,
  story
}: {
  files: Express.Multer.File[];
  outputPath: string;
  story: StoryPayload;
}) {
  const jobDir = path.join(GENERATED_DIR, `job-${Date.now()}`);
  await fs.mkdir(jobDir, { recursive: true });

  const selectedFiles = files.slice(0, Math.min(files.length, 8));
  console.log("Selected files for job:", selectedFiles.map((f) => ({ path: f.path, mimetype: f.mimetype, size: f.size })));
  const listPath = path.join(jobDir, "inputs.txt");
  const concatLines: string[] = [];

  for (const [index, file] of selectedFiles.entries()) {
    if (!file.mimetype.startsWith("image/")) {
      throw new Error(`Unsupported file type for slideshow: ${file.mimetype} at ${file.path}`);
    }
    const slidePath = path.join(jobDir, `slide-${index}.mp4`);
    const caption = story.sceneCaptions[index % story.sceneCaptions.length] ?? story.title;
    await createSlide(file.path, slidePath, caption);
    concatLines.push(`file '${slidePath.replace(/'/g, "'\\''")}'`);
  }

  await fs.writeFile(listPath, concatLines.join("\n"), "utf8");
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    outputPath
  ]);

  await fs.rm(jobDir, { recursive: true, force: true });
}

async function createSlide(inputPath: string, outputPath: string, caption: string) {
  const safeCaption = caption.replace(/:/g, "\\:").replace(/'/g, "\\'");
  const filter = [
    "scale=1080:1920:force_original_aspect_ratio=increase",
    "crop=1080:1920",
    "format=yuv420p",
    `drawbox=x=70:y=1510:w=940:h=250:color=black@0.52:t=fill`,
    `drawtext=text='${safeCaption}':fontcolor=white:fontsize=54:x=100:y=1560:box=0:line_spacing=12`
  ].join(",");

  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-t",
    "1.5",
    "-i",
    inputPath,
    "-vf",
    filter,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "28",
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    outputPath
  ]);
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg.path, args, { windowsHide: true });
    let stderr = "";
    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`ffmpeg timeout after 60 seconds (args: ${args.join(" ")})`));
    }, 60000);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "tripstory";
}

async function main() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  // Bind to 0.0.0.0 so the API is reachable from other devices on the LAN
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Tripstory API listening on ${PUBLIC_BASE_URL}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
