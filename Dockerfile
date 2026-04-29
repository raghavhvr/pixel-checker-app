# Use Microsoft's official Playwright image — has all Chromium system deps pre-installed
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build the Next.js app
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["npm", "start"]
