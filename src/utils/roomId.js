// create same room id for pair (a,b) regardless of order
const crypto = require('crypto');

function createRoomId(id1, id2){
  // simple stable approach: sort ids as strings then hash
  const sorted = [String(id1), String(id2)].sort().join(':');
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

module.exports = createRoomId;
