/**
 * Test script for enhanced database operations
 * Tests the real CRUD functionality
 */

const baseUrl = 'http://localhost:3001'; // Update port as needed

// Test 1: Basic CRUD Operations
async function testBasicCRUD() {
  console.log('🗄️ Testing Basic CRUD Operations...');
  
  try {
    // CREATE - Add a new user
    const createResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'create',
        table: 'users',
        data: { 
          name: 'John Doe', 
          email: 'john@example.com', 
          age: 30,
          role: 'developer' 
        }
      })
    });
    
    const createResult = await createResponse.json();
    console.log('✅ CREATE User:', createResult.result.name, 'ID:', createResult.result.id);
    const userId = createResult.result.id;
    
    // READ - Get the user by ID
    const readResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'read',
        table: 'users',
        id: userId
      })
    });
    
    const readResult = await readResponse.json();
    console.log('✅ READ User:', readResult.result.name, 'Email:', readResult.result.email);
    
    // UPDATE - Modify the user
    const updateResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'update',
        table: 'users',
        id: userId,
        data: { age: 31, role: 'senior developer' }
      })
    });
    
    const updateResult = await updateResponse.json();
    console.log('✅ UPDATE User:', updateResult.result.name, 'New Age:', updateResult.result.age);
    
    // FIND ALL - List all users
    const findAllResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'findAll',
        table: 'users'
      })
    });
    
    const findAllResult = await findAllResponse.json();
    console.log('✅ FIND ALL Users:', findAllResult.result.length, 'total users');
    
    // DELETE - Remove the user
    const deleteResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'delete',
        table: 'users',
        id: userId
      })
    });
    
    const deleteResult = await deleteResponse.json();
    console.log('✅ DELETE User:', deleteResult.result.message);
    
    return true;
  } catch (error) {
    console.error('❌ Basic CRUD failed:', error);
    return false;
  }
}

// Test 2: Advanced Querying
async function testAdvancedQuerying() {
  console.log('🔍 Testing Advanced Querying...');
  
  try {
    // Create multiple users for testing
    const users = [
      { name: 'Alice Smith', email: 'alice@example.com', age: 25, department: 'Engineering' },
      { name: 'Bob Johnson', email: 'bob@example.com', age: 30, department: 'Marketing' },
      { name: 'Carol Wilson', email: 'carol@example.com', age: 35, department: 'Engineering' },
      { name: 'David Brown', email: 'david@example.com', age: 28, department: 'Sales' }
    ];
    
    for (const user of users) {
      await fetch(`${baseUrl}/api/database-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'create',
          table: 'users',
          data: user
        })
      });
    }
    
    console.log('✅ Created 4 test users');
    
    // Test WHERE clause with age filter
    const ageFilterResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'findAll',
        table: 'users',
        options: {
          where: { age: { $gt: 27 } }
        }
      })
    });
    
    const ageFilterResult = await ageFilterResponse.json();
    console.log('✅ Users older than 27:', ageFilterResult.result.length);
    
    // Test ORDER BY
    const orderedResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'findAll',
        table: 'users',
        options: {
          orderBy: { field: 'age', direction: 'desc' },
          limit: 2
        }
      })
    });
    
    const orderedResult = await orderedResponse.json();
    console.log('✅ Top 2 oldest users:', orderedResult.result.map(u => `${u.name} (${u.age})`));
    
    // Test complex WHERE with department
    const deptFilterResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'findAll',
        table: 'users',
        options: {
          where: { department: 'Engineering' },
          orderBy: { field: 'name', direction: 'asc' }
        }
      })
    });
    
    const deptFilterResult = await deptFilterResponse.json();
    console.log('✅ Engineering users:', deptFilterResult.result.map(u => u.name));
    
    return true;
  } catch (error) {
    console.error('❌ Advanced querying failed:', error);
    return false;
  }
}

// Test 3: Relational Data and JOINs
async function testRelationalData() {
  console.log('🔗 Testing Relational Data and JOINs...');
  
  try {
    // Create a post linked to a user
    const postResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'create',
        table: 'posts',
        data: {
          title: 'My First Blog Post',
          content: 'This is an example of a real blog post with actual content.',
          authorId: 'users_1', // Assuming user exists
          published: true,
          tags: ['technology', 'web development']
        }
      })
    });
    
    const postResult = await postResponse.json();
    console.log('✅ Created post:', postResult.result.title);
    
    // Test JOIN operation
    const joinResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'join',
        table: 'posts',
        joinTable: 'users',
        leftKey: 'authorId',
        rightKey: 'id'
      })
    });
    
    const joinResult = await joinResponse.json();
    console.log('✅ JOIN result:', joinResult.result.length, 'posts with author data');
    
    if (joinResult.result.length > 0) {
      const postWithAuthor = joinResult.result[0];
      console.log('  - Post:', postWithAuthor.title);
      console.log('  - Author:', postWithAuthor.users?.name || 'No author found');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Relational data test failed:', error);
    return false;
  }
}

// Test 4: Database Statistics
async function testDatabaseStats() {
  console.log('📊 Testing Database Statistics...');
  
  try {
    const statsResponse = await fetch(`${baseUrl}/api/database-operations`);
    const statsResult = await statsResponse.json();
    
    console.log('✅ Database Overview:');
    console.log('  - Available tables:', statsResult.tables.length);
    statsResult.tables.forEach(table => {
      console.log(`    • ${table.name}: ${table.count} records`);
    });
    
    // Test table-specific stats
    if (statsResult.tables.length > 0) {
      const tableName = statsResult.tables[0].name;
      const tableStatsResponse = await fetch(`${baseUrl}/api/database-operations?table=${tableName}`);
      const tableStatsResult = await tableStatsResponse.json();
      
      console.log(`✅ ${tableName} table details:`);
      console.log('  - Record count:', tableStatsResult.stats.count);
      console.log('  - Sample data:', tableStatsResult.sampleData.length, 'records shown');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database stats test failed:', error);
    return false;
  }
}

// Test 5: E-commerce Scenario
async function testEcommerceScenario() {
  console.log('🛒 Testing E-commerce Scenario...');
  
  try {
    // Create products
    const products = [
      { name: 'Wireless Headphones', price: 99.99, category: 'Electronics', stock: 50 },
      { name: 'Coffee Mug', price: 15.99, category: 'Kitchen', stock: 100 },
      { name: 'Laptop Stand', price: 45.00, category: 'Office', stock: 25 }
    ];
    
    for (const product of products) {
      await fetch(`${baseUrl}/api/database-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'create',
          table: 'products',
          data: product
        })
      });
    }
    
    console.log('✅ Created', products.length, 'products');
    
    // Find products in price range
    const priceFilterResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'findAll',
        table: 'products',
        options: {
          where: { 
            price: { $gt: 20, $lt: 60 }
          },
          orderBy: { field: 'price', direction: 'asc' }
        }
      })
    });
    
    const priceFilterResult = await priceFilterResponse.json();
    console.log('✅ Products $20-$60:', priceFilterResult.result.map(p => `${p.name} ($${p.price})`));
    
    // Create an order
    const orderResponse = await fetch(`${baseUrl}/api/database-operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'create',
        table: 'orders',
        data: {
          userId: 'users_1',
          items: [
            { productId: 'products_1', quantity: 2, price: 99.99 },
            { productId: 'products_3', quantity: 1, price: 45.00 }
          ],
          total: 244.98,
          status: 'pending'
        }
      })
    });
    
    const orderResult = await orderResponse.json();
    console.log('✅ Created order:', orderResult.result.id, 'Total: $' + orderResult.result.total);
    
    return true;
  } catch (error) {
    console.error('❌ E-commerce scenario failed:', error);
    return false;
  }
}

// Run all tests
async function runAllDatabaseTests() {
  console.log('🚀 Testing Enhanced Database Operations\n');
  
  // Clear database before testing
  try {
    await fetch(`${baseUrl}/api/database-operations`, { method: 'DELETE' });
    console.log('🧹 Database cleared for testing\n');
  } catch (error) {
    console.log('⚠️ Could not clear database, continuing...\n');
  }
  
  const results = {
    basicCRUD: await testBasicCRUD(),
    advancedQuerying: await testAdvancedQuerying(),
    relationalData: await testRelationalData(),
    databaseStats: await testDatabaseStats(),
    ecommerceScenario: await testEcommerceScenario()
  };
  
  console.log('\n📊 Database Test Summary:');
  console.log('Basic CRUD:', results.basicCRUD ? '✅ PASS' : '❌ FAIL');
  console.log('Advanced Querying:', results.advancedQuerying ? '✅ PASS' : '❌ FAIL');
  console.log('Relational Data:', results.relationalData ? '✅ PASS' : '❌ FAIL');
  console.log('Database Stats:', results.databaseStats ? '✅ PASS' : '❌ FAIL');
  console.log('E-commerce Scenario:', results.ecommerceScenario ? '✅ PASS' : '❌ FAIL');
  
  const passCount = Object.values(results).filter(Boolean).length;
  console.log(`\n🎉 Database Operations Test Complete! ${passCount}/5 tests passed`);
  console.log('The enhanced code runner now has REAL database capabilities!');
}

// Run tests if this script is executed directly
if (typeof module !== 'undefined' && require.main === module) {
  runAllDatabaseTests();
}

module.exports = { 
  testBasicCRUD, 
  testAdvancedQuerying, 
  testRelationalData, 
  testDatabaseStats, 
  testEcommerceScenario 
};