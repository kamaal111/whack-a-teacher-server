const { sign, verify } = require('jsonwebtoken')

const signJWT = (user, callback) => {
  const payload = { name: user.name }
  const secret = process.env.SECRET_KEY || 'SupeRSecretOne'
  const options = { expiresIn: '1d' }

  sign(payload, secret, options, (err, jwt) => {
    if (err) return callback({ data: 'BAD REQUEST JWT' })

    return callback({
      data: 'OK',
      name: user.name,
      id: user.id,
      token: jwt
    })
  })
}

module.exports = { signJWT }
