FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    REVIEWS_FILE=/data/reviews.json
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# reviews live in /data, which compose mounts as a named volume
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4102
CMD ["node", "src/server.js"]
