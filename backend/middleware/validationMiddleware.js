/**
 * Input validation helpers and middleware
 */

function validateRegister(req, res, next) {
  const { full_name, email, password } = req.body;

  if (!full_name || full_name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Full name is required and must be at least 2 characters long.'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    return res.status(400).json({
      success: false,
      message: 'A valid email address is required.'
    });
  }

  if (!password || password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.'
    });
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Both email and password are required.'
    });
  }

  next();
}

function validateProduct(req, res, next) {
  const { name, brand, category_id, purchase_date, purchase_price } = req.body;

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Product name is required.' });
  }

  if (!brand || brand.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Brand name is required.' });
  }

  if (!category_id) {
    return res.status(400).json({ success: false, message: 'Category selection is required.' });
  }

  if (!purchase_date) {
    return res.status(400).json({ success: false, message: 'Purchase date is required.' });
  }

  // Purchase price is optional; normalize omitted or blank values to 0
  if (
    purchase_price === undefined ||
    purchase_price === null ||
    (typeof purchase_price === 'string' && purchase_price.trim() === '')
  ) {
    req.body.purchase_price = 0;
  } else if (typeof purchase_price !== 'number' && typeof purchase_price !== 'string') {
    return res.status(400).json({ success: false, message: 'Purchase price must be a valid non-negative number.' });
  } else {
    const priceNum = Number(purchase_price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, message: 'Purchase price must be a valid non-negative number.' });
    }
    req.body.purchase_price = priceNum;
  }

  next();
}

function validateRepair(req, res, next) {
  const { product_id, service_center, issue_description, repair_date, cost } = req.body;

  // Enforce product_id on new repair creation (POST)
  if (req.method === 'POST' && !product_id) {
    return res.status(400).json({ success: false, message: 'Product ID is required.' });
  }

  if (!service_center || service_center.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Service center name is required.' });
  }

  if (!issue_description || issue_description.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'Issue description is required.' });
  }

  if (!repair_date) {
    return res.status(400).json({ success: false, message: 'Repair date is required.' });
  }

  // Repair cost is optional; normalize omitted or blank values to 0
  if (cost === undefined || cost === null || (typeof cost === 'string' && cost.trim() === '')) {
    req.body.cost = 0;
  } else if (typeof cost !== 'number' && typeof cost !== 'string') {
    return res.status(400).json({ success: false, message: 'Repair cost must be a non-negative number.' });
  } else {
    const costNum = Number(cost);
    if (!Number.isFinite(costNum) || costNum < 0) {
      return res.status(400).json({ success: false, message: 'Repair cost must be a non-negative number.' });
    }
    req.body.cost = costNum;
  }

  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateProduct,
  validateRepair
};

