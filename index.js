const express = require('express')
const Sse = require('json-sse')
const cors = require('cors')
const { json: bodyParser } = require('body-parser')
const Sequelize = require('sequelize')
const { hashSync, compare } = require('bcrypt')
const { sign, verify } = require('jsonwebtoken')

const app = express()
const stream = new Sse()
const port = process.env.PORT || 4000

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/postgres'

const db = new Sequelize(databaseUrl)

// require('dotenv').config()

db.sync({ force: false })
  .then(() => console.log('Database connected'))
  .catch(console.error)

const User = db.define('user', {
  name: Sequelize.STRING,
  password: Sequelize.STRING
})

const Lobby = db.define('lobby', {
  game: Sequelize.STRING
})

User.belongsTo(Lobby)
Lobby.hasMany(User)

app.use(cors())
app.use(bodyParser())

app.get('/stream', async (req, res) => {
  const lobbys = await Lobby.findAll({ include: [User] })
  const data = JSON.stringify(lobbys)

  stream.updateInit(data)
  stream.init(req, res)
})

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

// Create User
app.post('/user', async (req, res) => {
  const { name, password } = req.body

  const findUser = await User.findAll({ where: { name } })
  const lobbys = await Lobby.findAll({ include: [User] })

  const data = JSON.stringify(lobbys)

  if (findUser.length > 0) {
    return res.send({ data: 'BAD REQUEST SIGN UP' })
  }

  const hashingSaltingRounds = 10
  const user = await User.create({
    name,
    password: hashSync(password, hashingSaltingRounds)
  })

  stream.updateInit(data)
  stream.send(data)

  return signJWT(user, response => res.send(response))
})

// Login User
app.post('/login', async (req, res) => {
  const { name, password } = req.body

  const findUser = await User.findAll({ where: { name } })

  const lobbys = await Lobby.findAll({ include: [User] })
  const data = JSON.stringify(lobbys)

  stream.updateInit(data)
  stream.send(data)

  if (findUser.length > 0) {
    const [user] = findUser

    return compare(password, user.password, (_err, response) => {
      if (response === false) {
        return res.send({ data: 'BAD REQUEST LOGIN' })
      }

      return signJWT(user, response => {
        console.log('response', response)
        return res.send(response)
      })
    })
  }

  return res.send({ data: 'BAD REQUEST LOGIN' })
})

// create lobby
app.post('/lobby', async (req, res) => {
  const { game } = req.body

  const authorization = req.header('authorization')

  if (authorization && authorization.startsWith('Bearer')) {
    const [, token] = authorization.split(' ')

    return verify(
      token,
      process.env.SECRET_KEY || 'SupeRSecretOne',
      { expiresIn: '1d' },
      async (err, decode) => {
        if (err || !decode) return res.send({ data: 'BAD REQUEST' })

        await Lobby.create({ game })
        const lobbys = await Lobby.findAll({ include: [User] })

        const data = JSON.stringify(lobbys)
        stream.updateInit(data)
        stream.send(data)

        return res.send({ data: 'OK' })
      }
    )
  }

  const lobbys = await Lobby.findAll({ include: [User] })

  const data = JSON.stringify(lobbys)
  stream.updateInit(data)
  stream.send(data)

  return res.send({ data: 'BAD REQUEST' })
})

// user in lobby
app.put('/user/:userId', async (req, res) => {
  const { userId } = req.params
  const { id: lobbyId } = req.body

  const authorization = req.header('authorization')

  if (authorization && authorization.startsWith('Bearer')) {
    const [, token] = authorization.split(' ')

    return verify(
      token,
      process.env.SECRET_KEY || 'SupeRSecretOne',
      { expiresIn: '1d' },
      async (err, decode) => {
        if (err || !decode) return res.send({ data: 'BAD REQUEST' })

        const user = await User.findByPk(userId)
        await user.update({ lobbyId })

        const lobbys = await Lobby.findAll({ include: [User] })

        const data = JSON.stringify(lobbys)
        stream.updateInit(data)
        stream.send(data)

        return res.send({ data: 'OK' })
      }
    )
  }

  const lobbys = await Lobby.findAll({ include: [User] })

  const data = JSON.stringify(lobbys)
  stream.updateInit(data)
  stream.send(data)

  return res.send({ data: 'BAD REQUEST' })
})

app.listen(port, () => console.log(`Listening ${port}`))
