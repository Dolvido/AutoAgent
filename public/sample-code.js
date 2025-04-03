// Calculate total price of items in a shopping cart
function calculateTotal(items) {
  let total = 0;
  
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  
  return total;
}

// Check if user is eligible for discount
function checkDiscount(user) {
  if (user.isPremium == true) {
    return true;
  } else if (user.purchaseCount > 10) {
    return true;
  } else {
    return false;
  }
}

// Process order
function processOrder(items, user) {
  const total = calculateTotal(items);
  const hasDiscount = checkDiscount(user);
  
  if (hasDiscount) {
    // Apply 10% discount
    return total * 0.9;
  }
  
  return total;
}

// Example usage
const cart = [
  { name: "Product 1", price: 20 },
  { name: "Product 2", price: 30 },
  { name: "Product 3", price: 50 }
];

const user = {
  name: "John",
  isPremium: false,
  purchaseCount: 12
};

const finalPrice = processOrder(cart, user);
console.log("Final price:", finalPrice); 