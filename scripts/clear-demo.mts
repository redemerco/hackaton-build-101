// npm run demo:clear → borra los datos SIMULADOS que haya dejado el viejo seed de demo (eventos con `_mock: true`,
// conexiones con token "mock", usuarios @demo.build101 y sus personajes). Los datos reales no se tocan.
// La demo usa datos reales: correr esto en el NAS si alguna vez se corrió el seed ahí.
import Database from "better-sqlite3";

const sqlite = new Database("data/pulso.db");
const run = (sql: string, ...args: string[]) => {
  try {
    return sqlite.prepare(sql).run(...args).changes;
  } catch {
    return 0; // la tabla todavía no existe: no hay nada que borrar
  }
};
const ev = run(`DELETE FROM raw_events WHERE json LIKE '%"_mock":true%'`);
const cn = run(`DELETE FROM connections WHERE token = ?`, "mock");
const pr = run(`DELETE FROM profiles WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@demo.build101')`);
const us = run(`DELETE FROM users WHERE email LIKE '%@demo.build101'`);
console.log(`borrados: ${ev} eventos, ${cn} conexiones, ${us} usuarios y ${pr} personajes simulados`);
