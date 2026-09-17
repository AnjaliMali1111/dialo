import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const keyPath = path.resolve('localhost+2-key.pem');
  const certPath = path.resolve('localhost+2.pem');
  const hasLocalCertificates = fs.existsSync(keyPath) && fs.existsSync(certPath);

  return {
    plugins: [react()],
    envDir: '..',
    server: {
      port: 5173,
      host: true,
      ...(command === 'serve' && hasLocalCertificates
        ? {
            https: {
              key: fs.readFileSync(keyPath),
              cert: fs.readFileSync(certPath)
            }
          }
        : {})
    }
  };
});

// import { defineConfig } from 'vite';
// import react from '@vitejs/plugin-react';

// // https://vitejs.dev/config/
// export default defineConfig({
//   plugins: [react()],
//   server: {
//     port: 5173,
//     host: true
//   }
// });

