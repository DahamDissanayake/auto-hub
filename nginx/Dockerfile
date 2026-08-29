FROM nginx:alpine

# The /n8n/ location is gated by HTTP basic auth. The htpasswd file is not in
# git (it is an auth-hash file); generate it at build time from ADMIN_PASSWORD,
# which the platform passes in as a build arg. User is always "admin".
ARG ADMIN_PASSWORD=changeme
RUN apk add --no-cache apache2-utils \
 && htpasswd -bc /etc/nginx/htpasswd admin "$ADMIN_PASSWORD" \
 && apk del apache2-utils

COPY nginx.conf /etc/nginx/nginx.conf
