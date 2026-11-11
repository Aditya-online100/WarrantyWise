const db = require('../services/db');

async function getCategories(req, res, next) {
  try {
    const categories = await db.query(
      'SELECT id, name, description, icon, display_order FROM Categories ORDER BY display_order ASC, name ASC;'
    );
    res.json({
      success: true,
      data: categories
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getCategories
};

