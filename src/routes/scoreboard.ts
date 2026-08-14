import { Router } from "express";
import { crawl } from "../content/index.js";
import { allTeamProgress } from "../domain/state.js";
import { requireTeam } from "./auth.js";

export const scoreboardRouter: Router = Router();

scoreboardRouter.get("/scoreboard", requireTeam, (req, res) => {
  res.render("scoreboard", {
    title: crawl.title,
    teams: allTeamProgress(),
    myTeamId: req.team!.id,
  });
});

scoreboardRouter.get("/api/scoreboard", requireTeam, (_req, res) => {
  res.json(allTeamProgress());
});
