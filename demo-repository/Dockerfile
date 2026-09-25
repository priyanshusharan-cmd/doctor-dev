FROM node:16-alpine

WORKDIR /app

COPY package*.json ./

# Uses npm install instead of npm ci (less deterministic)
RUN npm install --production

COPY . .
RUN npm run build

# DELIBERATE GAP: EXPOSE uses port 8080 but app listens on 3000
EXPOSE 8080

# Runs as root — no USER directive
CMD ["node", "dist/server.js"]
