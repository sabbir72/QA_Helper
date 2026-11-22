import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

function collectRelativeFiles(baseDir: string, currentDir = baseDir): string[] {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRelativeFiles(baseDir, full));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full).replace(/\\/g, '/');
      if (rel !== 'bundle-files.json') {
        files.push(rel);
      }
    }
  }
  return files;
}

export default defineConfig(() => {
  const rootDir = import.meta.dirname;
  return {
    define: {
      'import.meta.env.VITE_APP_URL': JSON.stringify(process.env.APP_URL || ''),
    },
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs still resolve
      // in production builds, and writes dist/bundle-files.json for clean MV3 .zip export.
      {
        name: 'veripulse-dist-packager',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(rootDir, 'dist');
          const srcAssets = path.resolve(rootDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
          if (fs.existsSync(distDir)) {
            const files = collectRelativeFiles(distDir);
            fs.writeFileSync(
              path.join(distDir, 'bundle-files.json'),
              JSON.stringify({ version: '1.1.0', files }, null, 2),
              'utf8'
            );
          }
        },
      },
    ],
    build: {
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
              {
                name: 'vendor-ui',
                test: /[\\/]node_modules[\\/](lucide-react|motion|framer-motion)[\\/]/,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
