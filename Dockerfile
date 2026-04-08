FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create the uploads temp directory
RUN mkdir -p uploads

EXPOSE 3000

CMD ["node", "server.js"]
