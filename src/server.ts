import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import { config, ensureDirectories } from "./config.js";
import { crawl, eventCode, stopCount } from "./content/index.js";
import { authRouter } from "./routes/auth.js";
import { playRouter } from "./routes/play.js";
import { scoreboardRouter } from "./routes/scoreboard.js";
import { adminRouter } from "./routes/admin.js";

ensureDirectories();

const app = express();

app.set("view engine", "ejs");
app.set("views", config.viewsDir);
// Behind Fly/Railway's proxy. Only affects logged IPs and secure-cookie logic.
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(config.publicDir, { maxAge: "1h" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use(authRouter);
app.use(playRouter);
app.use(scoreboardRouter);
app.use(adminRouter);

app.use((_req, res) => {
  res.status(404).send("Not found.");
});

// Error handler. Multer's size limit is the one users will actually hit, so it
// gets a message they can act on instead of a stack trace.
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ): void => {
    const wantsJson = req.path.startsWith("/api/");

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
      const message = `That file is too big (max ${mb}MB). Try a shorter video.`;
      if (wantsJson) {
        res.status(413).json({ error: "too_large", message });
      } else {
        res.status(413).send(message);
      }
      return;
    }

    console.error("Unhandled error:", err);
    if (wantsJson) {
      res.status(500).json({ error: "server_error", message: "Something broke. Try again." });
    } else {
      res.status(500).send("Something broke. Try again.");
    }
  },
);

app.listen(config.port, () => {
  console.log(`"${crawl.title}" listening on http://localhost:${config.port}`);
  console.log(`  stops:      ${stopCount}`);
  console.log(`  event code: ${eventCode}`);
  console.log(`  data dir:   ${config.dataDir}`);
  if (config.adminPassword === "changeme") {
    console.warn("  WARNING: ADMIN_PASSWORD is still the default. Set it before the crawl.");
  }
});
