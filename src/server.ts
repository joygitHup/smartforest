import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import http from 'http';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5001', 10);

// Backend API URL（Django 绑定 127.0.0.1 时勿用 localhost，避免解析到 ::1）
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8001';

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);

      // Proxy API requests to backend（补全尾部斜杠，匹配 Django APPEND_SLASH）
      if (parsedUrl.pathname?.startsWith('/api/')) {
        let pathname = parsedUrl.pathname;
        if (!pathname.endsWith('/')) {
          pathname = `${pathname}/`;
        }
        const backendUrl = new URL(
          `${pathname}${parsedUrl.search || ''}`,
          BACKEND_URL
        );

        const proxyReq = http.request(
          backendUrl,
          {
            method: req.method,
            headers: {
              ...req.headers,
              host: backendUrl.host,
            },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );

        proxyReq.on('error', (err) => {
          console.error('Proxy error:', err);
          res.statusCode = 502;
          res.end('Bad Gateway');
        });

        req.pipe(proxyReq);
        return;
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
