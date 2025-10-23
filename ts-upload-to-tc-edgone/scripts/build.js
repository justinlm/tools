import { execSync } from 'child_process';

console.log('Building TypeScript COS tool...');
try {
  execSync('tsc', { stdio: 'inherit' });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}