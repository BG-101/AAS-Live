FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
ENV NODE_ENV=production
EXPOSE 3001
USER node
CMD ["node", "index.js"]