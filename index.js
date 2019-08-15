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

db.sync({ force: false })
  .then(() => console.log('Database connected'))
  .catch(console.error)

const User = db.define(
  'user',
  {
    name: Sequelize.STRING,
    password: Sequelize.STRING
  },
  { timestamps: false }
)

const Lobby = db.define(
  'lobby',
  {
    game: Sequelize.STRING,
    playerOneScore: Sequelize.INTEGER,
    playerTwoScore: Sequelize.INTEGER
  },
  { timestamps: false }
)

User.belongsTo(Lobby)
Lobby.hasMany(User)

app.use(cors())
app.use(bodyParser())

app.get('/stream', async (req, res) => {
  try {
    const lobbys = await Lobby.findAll({ include: [User] })
    const data = JSON.stringify(lobbys)

    stream.updateInit(data)
    stream.init(req, res)
  } catch (error) {
    res.send({ data: error })
  }
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
  try {
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
  } catch (error) {
    return res.send({ data: error })
  }
})

// Login User
app.post('/login', async (req, res) => {
  try {
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

        return signJWT(user, response => res.send(response))
      })
    }

    return res.send({ data: 'BAD REQUEST LOGIN' })
  } catch (error) {
    return res.send({ data: error })
  }
})

// create lobby
app.post('/lobby', async (req, res) => {
  try {
    const { game } = req.body

    const authorization = req.header('authorization')

    if (authorization && authorization.startsWith('Bearer')) {
      const [, token] = authorization.split(' ')

      return verify(
        token,
        process.env.SECRET_KEY || 'SupeRSecretOne',
        { expiresIn: '1d' },
        async (err, decode) => {
          console.log(decode)
          try {
            if (err || !decode)
              return res.send({ data: 'IN VERIFY BAD REQUEST' })

            await Lobby.create({ game })
            const lobbys = await Lobby.findAll({ include: [User] })

            const data = JSON.stringify(lobbys)
            stream.updateInit(data)
            stream.send(data)

            return res.send({ data: 'OK' })
          } catch (error) {
            return res.send({ data: error })
          }
        }
      )
    }

    const lobbys = await Lobby.findAll({ include: [User] })

    const data = JSON.stringify(lobbys)
    stream.updateInit(data)
    stream.send(data)

    return res.send({ data: 'OUTSIDE VERIFY BAD REQUEST' })
  } catch (error) {
    return res.send({ data: error })
  }
})

// user in lobby
app.put('/user/:userId', async (req, res) => {
  try {
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
          try {
            if (err || !decode) return res.send({ data: 'BAD REQUEST' })

            const user = await User.findByPk(userId)
            await user.update({ lobbyId })

            const lobbys = await Lobby.findAll({ include: [User] })

            const data = JSON.stringify(lobbys)
            stream.updateInit(data)
            stream.send(data)

            return res.send({ data: 'OK' })
          } catch (error) {
            return res.send({ data: error })
          }
        }
      )
    }

    const lobbys = await Lobby.findAll({ include: [User] })

    const data = JSON.stringify(lobbys)
    stream.updateInit(data)
    stream.send(data)

    return res.send({ data: 'BAD REQUEST' })
  } catch (error) {
    return res.send({ data: error })
  }
})

app.listen(port, () => console.log(`Listening ${port}`))

// Increase score
app.put('/game/:lobbyId/score/:playerId', async (req, res) => {
  try {
    const { lobbyId, playerId } = req.params
    const { score } = req.body
    const lobby = await Lobby.findByPk(lobbyId)

    const increaseScore = async id => {
      if (id === 1) {
        await lobby.update({ playerOneScore: Number(score) })

        const lobbys = await Lobby.findAll({ include: [User] })

        const data = JSON.stringify(lobbys)
        stream.updateInit(data)
        stream.send(data)

        return res.send({ data: lobby.playerOneScore })
      } else if (id === 2) {
        await lobby.update({ playerTwoScore: Number(score) })

        const lobbys = await Lobby.findAll({ include: [User] })
        const data = JSON.stringify(lobbys)
        stream.updateInit(data)
        stream.send(data)

        return res.send({ data: lobby.playerTwoScore })
      }
    }
    const updateScore = increaseScore(Number(playerId))
    return updateScore()
  } catch (error) {
    return res.send({ data: error })
  }
})

// Reset lobby (when both click rematch)
app.put('/game/:lobbyId/rematch', async (req, res) => {
  try {
    const { lobbyId } = req.params

    const lobby = await Lobby.findByPk(lobbyId)

    await lobby.update({ playerOneScore: null, playerTwoScore: null })

    const lobbys = await Lobby.findAll({ include: [User] })
    const data = JSON.stringify(lobbys)
    stream.updateInit(data)
    stream.send(data)

    return res.send({ data: lobby })
  } catch (error) {
    return res.end({ data: error })
  }
})

// Delete lobby
app.delete('/games/:lobbyId', async (req, res) => {
  try {
    const { lobbyId } = req.params
<<<<<<< HEAD

    Lobby.destroy({ where: { id: lobbyId } })
=======
    await Lobby.destroy({
      where: {
        id: lobbyId
      }
    })
>>>>>>> b6164a91414270bcb7a94d3a4c246c7b7d873e84

    const lobbys = await Lobby.findAll({ include: [User] })
    const data = JSON.stringify(lobbys)
    stream.updateInit(data)
    stream.send(data)

    return res.send({ data: 'OK' })
  } catch (error) {
    return res.end({ data: error })
  }
})
