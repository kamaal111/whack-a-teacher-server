const express = require('express')
const Sse = require('json-sse')
const cors = require('cors')
const { json: bodyParser } = require('body-parser')
const { hashSync, compare } = require('bcrypt')
const { verify } = require('jsonwebtoken')

const { User, Lobby } = require('./models')
const { signJWT } = require('./auth')

const app = express()
const stream = new Sse()
const port = process.env.PORT || 5000

app.use(cors())
app.use(bodyParser())

const findAllLobbiesAndStream = async stream => {
  const lobbys = await Lobby.findAll({ include: [User] })
  const data = JSON.stringify(lobbys)

  stream.updateInit(data)
  stream.send(data)
}

// Initilize Stream
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

// Create User Route
app.post('/user', async (req, res) => {
  try {
    const { name, password } = req.body

    const findUser = await User.findAll({ where: { name } })

    if (findUser.length > 0) {
      findAllLobbiesAndStream(stream)
      return res.send({ data: 'BAD REQUEST SIGN UP' })
    }

    const hashingSaltingRounds = 10
    const user = await User.create({
      name,
      password: hashSync(password, hashingSaltingRounds)
    })

    findAllLobbiesAndStream()

    return signJWT(user, response => res.send(response))
  } catch (error) {
    return res.send({ data: error })
  }
})

// Login User Route
app.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body

    const findUser = await User.findAll({ where: { name } })

    if (findUser.length > 0) {
      const [user] = findUser

      findAllLobbiesAndStream(stream)

      return compare(password, user.password, (err, response) => {
        if (err) return res.send({ data: err })

        if (response === false) {
          return res.send({ data: 'BAD REQUEST LOGIN' })
        }

        return signJWT(user, response => res.send(response))
      })
    }

    findAllLobbiesAndStream(stream)

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
          try {
            if (err || !decode)
              return res.send({ data: 'IN VERIFY BAD REQUEST' })

            await Lobby.create({ game })

            findAllLobbiesAndStream(stream)

            return res.send({ data: 'OK' })
          } catch (error) {
            return res.send({ data: error })
          }
        }
      )
    }

    findAllLobbiesAndStream(stream)

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

            findAllLobbiesAndStream(stream)

            return res.send({ data: 'OK' })
          } catch (error) {
            return res.send({ data: error })
          }
        }
      )
    }

    findAllLobbiesAndStream(stream)

    return res.send({ data: 'BAD REQUEST' })
  } catch (error) {
    return res.send({ data: error })
  }
})

app.put('/user/:userId/remove', async (req, res) => {
  try {
    const { userId } = req.params

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
            await user.update({ lobbyId: null })

            findAllLobbiesAndStream(stream)

            return res.send({ data: 'OK' })
          } catch (error) {
            return res.send({ data: error })
          }
        }
      )
    }

    findAllLobbiesAndStream(stream)

    return res.send({ data: 'BAD REQUEST' })
  } catch (error) {
    return res.send({ data: error })
  }
})

// Increase score
app.put('/game/:lobbyId/score/:playerId', async (req, res) => {
  try {
    const { lobbyId, playerId } = req.params
    const { score } = req.body
    const lobby = await Lobby.findByPk(lobbyId)

    if (Number(playerId) === 1) {
      await lobby.update({ playerOneScore: Number(score) })

      findAllLobbiesAndStream(stream)

      return res.send({ data: lobby.playerOneScore })
    }

    await lobby.update({ playerTwoScore: Number(score) })

    findAllLobbiesAndStream(stream)

    return res.send({ data: lobby.playerTwoScore })
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

    findAllLobbiesAndStream(stream)

    return res.send({ data: lobby })
  } catch (error) {
    return res.end({ data: error })
  }
})

// Delete lobby
app.delete('/games/:lobbyId', async (req, res) => {
  try {
    const { lobbyId } = req.params

    Lobby.destroy({ where: { id: lobbyId } })

    findAllLobbiesAndStream(stream)

    return res.send({ data: 'OK' })
  } catch (error) {
    return res.end({ data: error })
  }
})

app.listen(port, () => console.log(`Listening ${port}`))
