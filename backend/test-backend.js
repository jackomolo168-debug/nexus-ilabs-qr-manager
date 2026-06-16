// Simple backend test script
const http = require('http');

const tests = [
  {
    name: 'Server is running',
    test: () => {
      return new Promise((resolve, reject) => {
        http.get('http://localhost:5000', (res) => {
          resolve({ status: res.statusCode, success: true });
        }).on('error', (err) => {
          resolve({ status: 'ERROR', success: false, error: err.message });
        });
      });
    }
  },
  {
    name: 'Auth endpoint exists',
    test: () => {
      return new Promise((resolve, reject) => {
        http.get('http://localhost:5000/api/auth/me', (res) => {
          resolve({ status: res.statusCode, success: res.statusCode === 401 || res.statusCode === 200 });
        }).on('error', (err) => {
          resolve({ status: 'ERROR', success: false, error: err.message });
        });
      });
    }
  },
  {
    name: 'QR codes endpoint exists',
    test: () => {
      return new Promise((resolve, reject) => {
        http.get('http://localhost:5000/api/qrcodes', (res) => {
          resolve({ status: res.statusCode, success: res.statusCode === 401 || res.statusCode === 200 });
        }).on('error', (err) => {
          resolve({ status: 'ERROR', success: false, error: err.message });
        });
      });
    }
  },
  {
    name: 'Analytics endpoint exists',
    test: () => {
      return new Promise((resolve, reject) => {
        http.get('http://localhost:5000/api/analytics/scans', (res) => {
          resolve({ status: res.statusCode, success: res.statusCode === 401 || res.statusCode === 200 });
        }).on('error', (err) => {
          resolve({ status: 'ERROR', success: false, error: err.message });
        });
      });
    }
  }
];

async function runTests() {
  console.log('🧪 Running Backend Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      const result = await test.test();
      if (result.success) {
        console.log(`✅ ${test.name}: PASSED (Status: ${result.status})`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED (Status: ${result.status})`);
        if (result.error) console.log(`   Error: ${result.error}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ERROR - ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
  
  if (failed === 0) {
    console.log('\n✨ All basic backend tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Backend may need database setup.');
  }
}

runTests();
