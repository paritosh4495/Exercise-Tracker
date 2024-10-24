

const express = require("express");
const mongo = require("mongodb");
const mongoose = require("mongoose");
const moment = require("moment");
const shortid = require("shortid");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const db = mongoose.connection;
const Schema = mongoose.Schema;
const bodyParser = require("body-parser");

mongoose.connect(
  process.env.MLAB_URI || 'mongodb://localhost:27017/exTracker',
  { useNewUrlParser: true, useUnifiedTopology: true }
);
mongoose.set("useFindAndModify", false);

db.on("error", console.error.bind(console, "connection error"));
db.once("open", () => console.log("DB ONLINE"));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// Schemas
const exerciseSchema = new Schema({
  _id: {
    type: String,
    default: shortid.generate
  },
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, required: true }
});
const userSchema = new Schema({
  _id: {
    type: String,
    default: shortid.generate
  },
  name: { type: String, required: true },
  count: { type: Number, default: 0 },
  exercises: [exerciseSchema]
});

// Models
const Exercise = mongoose.model("Exercise", exerciseSchema);
const User = mongoose.model("User", userSchema);

// Not found middleware
app.use((req, res, next) => {
  if (req.body || req.params) return next();
  return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});

/**
 * Create user handler
 */
const createUserHandler = async (req, res, next) => {
  const user = await User.findOne({ name: req.body.username });
  if (user) {
    return res.status(200).json({
      _id: user._id,
      username: user.name,
      count: user.count
    });
  }
  const newUser = new User({
    name: req.body.username
  });
  try {
    await newUser.save();
    return res.status(201).json({ username: newUser.name, _id: newUser._id });
  } catch (err) {
    return next(err);
  }
};

/**
 * Add exercise handler
 */
const addExerciseHandler = async (req, res, next) => {
  const exercise = new Exercise({
    description: req.body.description,
    duration: req.body.duration,
    date: req.body.date ? new Date(req.body.date) : new Date()
  });
  try {
    const user = await User.findByIdAndUpdate(req.params._id, {
      $push: {
        exercises: exercise
      },
      $inc: {
        count: 1
      }
    }, { new: true });
    
    return res.status(201).json({
      username: user.name,
      description: exercise.description,
      duration: exercise.duration,
      _id: user._id,
      date: exercise.date.toDateString()
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get user info handler (exercise log)
 */
const getUserHandler = async (req, res, next) => {
  const query = req.query;
  const from = query.from ? new Date(query.from) : null;
  const to = query.to ? new Date(query.to) : null;
  const limit = query.limit ? parseInt(query.limit) : null;

  try {
    let user = await User.findById(req.params._id)
      .select("_id name count exercises")
      .exec();
    
    let userClone = { ...user.toObject() };
    
    if (userClone.exercises && userClone.exercises.length) {
      // Format exercises to return as description, duration, date
      userClone.log = userClone.exercises.map(ex => ({
        description: ex.description,
        duration: ex.duration,
        date: ex.date.toDateString()
      }));

      // Filter by date range if "from" and/or "to" is provided
      if (from || to) {
        userClone.log = userClone.log.filter(ex => {
          const exDate = new Date(ex.date);
          if (from && exDate < from) return false;
          if (to && exDate > to) return false;
          return true;
        });
      }

      // Limit the number of logs if "limit" is provided
      if (limit && limit < userClone.log.length) {
        userClone.log.length = limit;
      }
    }

    return res.status(200).json({
      _id: userClone._id,
      username: userClone.name,
      count: userClone.exercises.length,
      log: userClone.log
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * Get all users handler
 */
const getAllUsersHandlers = async (req, res, next) => {
  try {
    const users = await User.find({}).select("_id name");
    return res.status(200).json(users.map(user => ({
      _id: user._id,
      username: user.name
    })));
  } catch (err) {
    return next(err);
  }
};

// ENDPOINTS
// Create user
app.post("/api/users", createUserHandler);
// Add exercise
app.post("/api/users/:_id/exercises", addExerciseHandler);
// Get exercises log for user
app.get("/api/users/:_id/logs", getUserHandler);
// Get all users
app.get("/api/users", getAllUsersHandlers);

// SERVER LISTENING
const listener = app.listen(port, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
