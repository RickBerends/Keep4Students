import { Router, type Request, type Response, type NextFunction } from "express";
import { crawl, eventCode } from "../content/index.js";
import { config } from "../config.js";
import { normalize } from "../domain/answers.js";
import { createSession, destroySession, joinOrCreateTeam, teamForSession } from "../domain/teams.js";
import type { TeamRow } from "../domain/state.js";

export const SESSION_COOKIE = "crawl_session";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      team?: TeamRow;
    }
  }
}

/** Attaches req.team when the cookie is valid; redirects to the login page otherwise. */
export function requireTeam(req: Request, res: Response, next: NextFunction): void {
  const team = teamForSession(req.cookies?.[SESSION_COOKIE]);
  if (!team) {
    if (req.path.startsWith("/api/")) {
      res.status(401).json({ error: "not_logged_in" });
      return;
    }
    res.redirect("/");
    return;
  }
  req.team = team;
  next();
}

export const authRouter: Router = Router();

authRouter.get("/", (req, res) => {
  if (teamForSession(req.cookies?.[SESSION_COOKIE])) {
    res.redirect("/play");
    return;
  }
  res.render("login", { title: crawl.title, error: null, teamName: "" });
});

authRouter.post("/login", (req, res) => {
  const code = String(req.body?.code ?? "");
  const teamName = String(req.body?.teamName ?? "").trim();

  const render = (error: string) =>
    res.status(400).render("login", { title: crawl.title, error, teamName });

  // Loose comparison: the code gets read aloud in a noisy bar.
  if (normalize(code) !== normalize(eventCode)) return render("Wrong event code.");
  if (teamName.length < 2) return render("Pick a team name (at least 2 characters).");
  if (teamName.length > 40) return render("That team name is too long.");

  const team = joinOrCreateTeam(teamName);
  const token = createSession(team.id);

  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: config.sessionMaxAgeMs,
  });
  res.redirect("/play");
});

authRouter.post("/logout", (req, res) => {
  destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.redirect("/");
});
