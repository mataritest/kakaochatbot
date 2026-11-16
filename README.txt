AGAEBOM KAKAO CHATBOT

Node.js 22+ / no third-party runtime dependencies
Start: node server.mjs
Test: npm test
Render env: HOST=0.0.0.0, NODE_ENV=production, SKILL_TOKEN=(secret, 24+ chars), NODE_VERSION=22
Health: GET /health
Skill: POST /skill with x-skill-token header
Clinic approval and actual Kakao channel checks are required before live patient use.
