const express = require('express')
const Sse = require('json-sse')
const cors = require('cors')
const { json: bodyParser } = require('body-parser')
const Sequelize = require('sequelize')
const { hashSync, compareSync } = require('bcrypt')

const app = express()
const stream = new Sse()
const port = process.env.PORT || 4000

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/postgres'

const db = new Sequelize(databaseUrl)

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

// Create User
app.post('/user', async (req, res) => {
  const { name, password } = req.body

  const findUser = await User.findAll({ where: { name } })

  if (findUser.length > 0) {
    const lobbys = await Lobby.findAll({ include: [User] })

    const data = JSON.stringify(lobbys)

    stream.updateInit(data)
    stream.send(data)

    return res.send({ data: 'BAD REQUEST' })
  }

  await User.create({ name, password: hashSync(password, 10) })

  const lobbys = await Lobby.findAll({ include: [User] })

  const data = JSON.stringify(lobbys)

  stream.updateInit(data)
  stream.send(data)

  return res.send({ data: 'OK' })
})

// Login User
app.post('/login', async (req, res) => {
  const { name, password } = req.body

  const user = await User.findOne({ where: { name } })
  const lobbys = await Lobby.findAll({ include: [User] })

  const data = JSON.stringify(lobbys)

  stream.updateInit(data)
  stream.send(data)

  res.send(entity)
})

// create lobby
app.post('/lobby', async (req, res) => {
  const { game } = req.body

  const entity = await Lobby.create({ game })
  const lobbys = await Lobby.findAll({ include: [User] })

  const data = JSON.stringify(lobbys)

  stream.updateInit(data)
  stream.send(data)

  res.send(entity)
})

// user in lobby
app.put('/user/:userId/lobby/', async (req, res) => {
  const { userId } = req.params
  const { id } = req.body

  const userInLobby = await User.findByPk(userId).then(user =>
    user.update({ lobbyId: id })
  )

  const data = JSON.stringify(userInLobby)

  stream.updateInit(data)
  stream.send(data)

  res.send(userInLobby)
})

app.listen(port, () => console.log(`Listening ${port}`))
