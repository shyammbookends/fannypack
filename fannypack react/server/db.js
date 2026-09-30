import pg from 'pg';

// Prices in this DB are whole rupees stored as INTEGER; make BIGINT ids plain numbers.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const query = (text, params) => pool.query(text, params);

// Run fn inside a transaction; rolls back on any error.
// db.afterCommit(cb) queues work (e.g. emails) that must only happen once the data is saved.
export async function tx(fn) {
  const client = await pool.connect();
  const hooks = [];
  client.afterCommit = (cb) => hooks.push(cb);
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    for (const cb of hooks) Promise.resolve().then(cb).catch((err) => console.error('After-commit task failed:', err.message));
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    delete client.afterCommit;
    client.release();
  }
}
