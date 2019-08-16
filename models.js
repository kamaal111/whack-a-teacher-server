const Sequelize = require('sequelize')

const db = require('./database')

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

module.exports = { User, Lobby }
