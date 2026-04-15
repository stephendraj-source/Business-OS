import { Router } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

export const favouritesRouter = Router();

// GET /favourites — list all for current user
favouritesRouter.get('/favourites', async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const result = await db.execute(
      sql`SELECT * FROM user_favourites WHERE user_id = ${userId} ORDER BY created_at ASC`
    );
    res.json(result.rows);
  } catch (err) {
    req.log.error(err);
    res.json([]);
  }
});

// POST /favourites — add a favourite
favouritesRouter.post('/favourites', async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    const tenantId = (req as any).auth?.tenantId ?? null;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { item_type, item_id, item_name = '' } = req.body as Record<string, any>;
    if (!item_type || item_id == null) return res.status(400).json({ error: 'item_type and item_id required' });
    const result = await db.execute(
      sql`INSERT INTO user_favourites (user_id, tenant_id, item_type, item_id, item_name)
          VALUES (${userId}, ${tenantId}, ${String(item_type)}, ${Number(item_id)}, ${String(item_name)})
          ON CONFLICT (user_id, item_type, item_id) DO UPDATE SET item_name = EXCLUDED.item_name
          RETURNING *`
    );
    res.status(201).json((result.rows as any[])[0]);
  } catch (err) {
    req.log.error(err);
    res.status(201).json({ id: -1, item_type, item_id, item_name, warning: 'favourites unavailable in local setup' });
  }
});

// DELETE /favourites/:id — remove by DB id
favouritesRouter.delete('/favourites/:id', async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = parseInt(req.params.id, 10);
    await db.execute(
      sql`DELETE FROM user_favourites WHERE id = ${id} AND user_id = ${userId}`
    );
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(204).end();
  }
});

// DELETE /favourites/by-item/:type/:itemId — remove by item reference
favouritesRouter.delete('/favourites/by-item/:type/:itemId', async (req, res) => {
  try {
    const userId = (req as any).auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    await db.execute(
      sql`DELETE FROM user_favourites
          WHERE user_id = ${userId} AND item_type = ${req.params.type} AND item_id = ${parseInt(req.params.itemId, 10)}`
    );
    res.status(204).end();
  } catch (err) {
    req.log.error(err);
    res.status(204).end();
  }
});
