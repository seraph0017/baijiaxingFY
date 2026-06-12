FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8765
ENV DATA_DIR=/app/runtime

COPY --chown=node:node package.json ./
COPY --chown=node:node server.js ./
COPY --chown=node:node verify-*.mjs ./
COPY --chown=node:node index.html ./
COPY --chown=node:node README.md ./
COPY --chown=node:node robots.txt ./
COPY --chown=node:node sitemap.xml ./
COPY --chown=node:node manifest.webmanifest ./
COPY --chown=node:node assets ./assets
COPY --chown=node:node data/seed-workspace.json ./data/seed-workspace.json

RUN mkdir -p /app/runtime/backups && chown -R node:node /app/runtime /app/data

USER node

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8765) + '/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "server.js"]
