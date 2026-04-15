import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import { getCredits } from "../lib/credits";

const router: IRouter = Router();

// GET /api/credits — returns current tenant's credit balance
router.get("/credits", requireAuth, async (req, res) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      // Superusers don't belong to a tenant — return null
      res.json({ credits: null, isSuperUser: true });
      return;
    }
    const credits = await getCredits(tenantId);
    res.json({ credits, tenantId });
  } catch (err) {
    req.log.error(err, "Failed to get credits");
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as creditsRouter };
