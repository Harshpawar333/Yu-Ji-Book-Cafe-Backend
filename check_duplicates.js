require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper function to normalize Indian phone numbers
function normalizeMobile(num) {
  if (!num) return "UNKNOWN";
  
  // Strip all non-digit characters (spaces, +, -, etc)
  let digits = String(num).replace(/\D/g, "");
  
  // Remove typical Indian country codes if they exist (91, +91, 0)
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.substring(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.substring(1);
  }
  
  return digits;
}

async function findDuplicates() {
  console.log("🔍 Scanning Supabase for duplicate customer contacts...");
  
  // Because of the UNIQUE constraint on mobile_number, exact strings won't duplicate.
  // We need to fetch all and normalize them to catch variations (e.g. "9876543210" vs "+919876543210")
  let allCustomers = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, mobile_number, created_at')
      .range(page * pageSize, (page + 1) * pageSize - 1);
      
    if (error) {
      console.error("❌ Error fetching:", error);
      process.exit(1);
    }
    
    if (!data || data.length === 0) break;
    
    allCustomers = allCustomers.concat(data);
    page++;
  }
  
  console.log(`✅ Loaded ${allCustomers.length} total customers.`);
  
  // Map normalized numbers to arrays of customers
  const numberMap = {};
  
  allCustomers.forEach(customer => {
    const rawNum = customer.mobile_number;
    const normalized = normalizeMobile(rawNum);
    
    if (!numberMap[normalized]) {
      numberMap[normalized] = [];
    }
    numberMap[normalized].push(customer);
  });
  
  // Filter for maps > 1
  let duplicateCount = 0;
  for (const [phone, users] of Object.entries(numberMap)) {
    if (users.length > 1) {
      duplicateCount++;
      console.log(`\n⚠️ Duplicate Detected on base number: ${phone}`);
      users.forEach(u => {
         console.log(`   - ID: ${u.id.substring(0,8)}... | Name: ${u.name.padEnd(15)} | Raw Number in DB: ${u.mobile_number} | Joined: ${u.created_at.split('T')[0]}`);
      });
    }
  }
  
  console.log(`\n=================================================`);
  if (duplicateCount === 0) {
    console.log(`🎉 Perfect! No normalized duplicate contacts found!`);
  } else {
    console.log(`🚨 Found ${duplicateCount} distinct phone numbers with duplicated accounts!`);
  }
}

findDuplicates();
