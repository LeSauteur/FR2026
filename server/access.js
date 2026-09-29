// Все проверки прав — только здесь и только на сервере.

export const STAFF_ROLES = new Set(['superadmin', 'franchise']);
export const CONTENT_ROLES = new Set(['superadmin', 'franchise', 'editor']);

export const isStaff = (user) => STAFF_ROLES.has(user?.role);
export const canEditContent = (user) => CONTENT_ROLES.has(user?.role);

export function membership(db, user, officeId) {
  return db.prepare('SELECT role FROM office_memberships WHERE user_id = ? AND office_id = ?')
    .get(user.id, Number(officeId)) || null;
}

export function canSeeOffice(db, user, officeId) {
  return isStaff(user) || Boolean(membership(db, user, officeId));
}

// Банковские реквизиты: франшизный отдел и собственник/управляющий этого офиса.
export function canSeeRequisites(db, user, officeId) {
  if (isStaff(user)) return true;
  const m = membership(db, user, officeId);
  return Boolean(m && (m.role === 'owner' || m.role === 'manager'));
}

export function canSeeArticle(user, article) {
  if (!article) return false;
  if (article.status !== 'published' && !canEditContent(user)) return false;
  return article.audience === 'all' || canEditContent(user);
}

export function articleAudienceFilter(user) {
  return canEditContent(user) ? '1 = 1' : "audience = 'all' AND status = 'published'";
}

export function myOfficeIds(db, user) {
  return db.prepare('SELECT office_id FROM office_memberships WHERE user_id = ?').all(user.id).map((r) => r.office_id);
}
