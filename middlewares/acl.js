const db = require("../lib/db");

// Harus sama dengan model_type yang dipakai saat seeding
const MODEL_TYPE = "App\\Models\\User";

/*
 Middleware ACL: cek apakah user punya salah satu permission yang dibutuhkan.
 Skema (pola Spatie):
 users.id = model_has_roles.model_id (model_type = 'App\Models\User')
 model_has_roles.role_id -> role_has_permissions.role_id
 role_has_permissions.permission_id -> permissions.id
 */
const checkPermission = (requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.session.userId) {
      return res.redirect("/login");
    }

    const permissionsArray = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    try {
      const query = `
        SELECT DISTINCT p.name
        FROM permissions p
        JOIN role_has_permissions rhp ON p.id = rhp.permission_id
        JOIN model_has_roles mhr ON rhp.role_id = mhr.role_id
        WHERE mhr.model_id = ?
          AND mhr.model_type = ?
          AND p.name IN (?)
      `;

      const [rows] = await db.query(query, [
        req.session.userId,
        MODEL_TYPE,
        permissionsArray,
      ]);

      if (rows.length > 0) {
        return next();
      }

      return res.status(403).render("error", {
        message: "Forbidden: Anda tidak punya hak akses ke halaman ini.",
        error: { status: 403, stack: "" },
      });
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { checkPermission };