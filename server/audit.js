const serialize = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

export function audit(db, { user, action, entity = null, entityId = null, oldValue, newValue, ip = null }) {
  db.prepare(`INSERT INTO audit_log (user_id, action, entity, entity_id, old_value, new_value, ip)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(user?.id ?? null, action, entity, entityId === null ? null : String(entityId), serialize(oldValue), serialize(newValue), ip);
}
