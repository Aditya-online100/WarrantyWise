const db = require('../services/db');

function computeWarrantyStatus(endDateStr) {
  if (!endDateStr) return { status: 'Expired', daysRemaining: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr);
  end.setHours(0, 0, 0, 0);

  const diffTime = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status = 'Active';
  if (diffDays < 0) {
    status = 'Expired';
  } else if (diffDays <= 30) {
    status = 'Expiring Soon';
  }

  return { status, daysRemaining: diffDays };
}

/**
 * Get comprehensive analytics for user dashboard
 */
async function getDashboardAnalytics(req, res, next) {
  try {
    const userId = req.user.id;

    // 1. Fetch user products with warranty and repairs
    const products = await db.query(
      `SELECT 
        p.id, p.name, p.brand, p.purchase_price, p.purchase_date, p.category_id,
        c.name AS category_name,
        w.id AS warranty_id, w.provider_name, w.end_date,
        COALESCE(r.repair_cost, 0) AS total_repair_cost,
        COALESCE(r.repair_count, 0) AS repair_count
      FROM Products p
      INNER JOIN Categories c ON p.category_id = c.id
      LEFT JOIN Warranties w ON p.id = w.product_id
      LEFT JOIN (
        SELECT product_id, SUM(cost) AS repair_cost, COUNT(id) AS repair_count
        FROM Repairs
        WHERE user_id = ?
        GROUP BY product_id
      ) r ON p.id = r.product_id
      WHERE p.user_id = ?;`,
      [userId, userId]
    );

    let activeCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let totalRepairExpenditure = 0;
    let totalPurchaseValue = 0;

    const upcomingExpirations = [];

    products.forEach(p => {
      totalPurchaseValue += parseFloat(p.purchase_price) || 0;
      totalRepairExpenditure += parseFloat(p.total_repair_cost) || 0;

      if (p.end_date) {
        const calc = computeWarrantyStatus(p.end_date);
        if (calc.status === 'Active') activeCount++;
        else if (calc.status === 'Expiring Soon') {
          expiringCount++;
          upcomingExpirations.push({
            product_id: p.id,
            product_name: p.name,
            brand: p.brand,
            provider_name: p.provider_name,
            end_date: p.end_date,
            days_remaining: calc.daysRemaining
          });
        } else {
          expiredCount++;
        }
      }
    });

    // Sort upcoming expirations by days remaining
    upcomingExpirations.sort((a, b) => a.days_remaining - b.days_remaining);

    // 2. Category distribution
    const categoryMap = {};
    products.forEach(p => {
      const cat = p.category_name;
      if (!categoryMap[cat]) {
        categoryMap[cat] = { name: cat, count: 0, total_value: 0, repair_cost: 0 };
      }
      categoryMap[cat].count += 1;
      categoryMap[cat].total_value += parseFloat(p.purchase_price) || 0;
      categoryMap[cat].repair_cost += parseFloat(p.total_repair_cost) || 0;
    });

    const categoryDistribution = Object.values(categoryMap);

    // 3. Products with highest repair costs
    const topRepairProducts = products
      .filter(p => p.total_repair_cost > 0)
      .sort((a, b) => b.total_repair_cost - a.total_repair_cost)
      .slice(0, 5)
      .map(p => ({
        product_id: p.id,
        name: p.name,
        brand: p.brand,
        purchase_price: p.purchase_price,
        total_repair_cost: p.total_repair_cost,
        repair_ratio_pct: p.purchase_price > 0 
          ? Math.round((p.total_repair_cost / p.purchase_price) * 100) 
          : 0
      }));

    // 4. Monthly repair spending (from Repairs table)
    const repairs = await db.query(
      `SELECT repair_date, cost 
       FROM Repairs 
       WHERE user_id = ? 
       ORDER BY repair_date ASC;`,
      [userId]
    );

    const monthlySpendMap = {};
    repairs.forEach(r => {
      if (r.repair_date) {
        const repairDateStr =
          r.repair_date instanceof Date
            ? r.repair_date.toISOString()
            : String(r.repair_date);
        const monthKey = repairDateStr.substring(0, 7); // YYYY-MM
        monthlySpendMap[monthKey] = (monthlySpendMap[monthKey] || 0) + (parseFloat(r.cost) || 0);
      }
    });

    const monthlyRepairSpending = Object.keys(monthlySpendMap).map(month => ({
      month,
      cost: monthlySpendMap[month]
    }));

    res.json({
      success: true,
      data: {
        kpis: {
          total_products: products.length,
          active_warranties: activeCount,
          expiring_warranties: expiringCount,
          expired_warranties: expiredCount,
          total_repair_expenditure: totalRepairExpenditure,
          total_purchase_value: totalPurchaseValue
        },
        category_distribution: categoryDistribution,
        top_repair_products: topRepairProducts,
        upcoming_expirations: upcomingExpirations,
        monthly_repair_spending: monthlyRepairSpending
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getDashboardAnalytics
};

