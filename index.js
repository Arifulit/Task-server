const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
const { ObjectId } = require("mongodb");
// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://task-management-f6e55.web.app",
      "https://task-management-f6e55.firebaseapp.com",
    ], // Replace with your actual frontend URL in production
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.1bdxs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();
    console.log("Connected to MongoDB!");

    const db = client.db("Task-manager");
    const usersCollection = db.collection("users");
    const tasksCollection = db.collection("tasks");

    // Middleware to Verify JWT Token
    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" });
        }
        req.user = decoded;
        next();
      });
    };

    // Auth API - Store User in MongoDB on First Login
    app.post("/login", async (req, res) => {
      // verifyToken removed
      const { uid, email, displayName } = req.body;

      if (!uid || !email || !displayName) {
        return res.status(400).send({ message: "Invalid user data" });
      }

      try {
        // Check if user exists in MongoDB
        const existingUser = await usersCollection.findOne({ email });

        if (!existingUser) {
          // If user doesn't exist, save them to MongoDB
          await usersCollection.insertOne({
            uid,
            email,
            displayName,
            createdAt: new Date(),
          });
        }

        // Generate JWT Token
        const token = jwt.sign(
          { uid, email, displayName },
          process.env.ACCESS_TOKEN_SECRET,
          {
            expiresIn: "10h",
          }
        );

        // Store token in a cookie
        res
          .cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
          })
          .send({ success: true, token });
      } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Logout API
    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production", // For production use HTTPS
          sameSite: "none",
        })
        .send({ success: true });
    });

    // Get Logged-in User Details
    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send(user);
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // Protected Route - Task Management Example
    app.post("/tasks", async (req, res) => {
      try {
        const task = req.body;
        task.createdAt = new Date(); // Optionally add a createdAt field to track task creation time
        const result = await tasksCollection.insertOne(task);
        res.status(201).json(result); // Send back the result
      } catch (error) {
        console.error("Error adding task:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/tasks", async (req, res) => {
      try {
        const tasks = await tasksCollection.find({}).toArray();
        res.send(tasks);
      } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.get("/tasks/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // Ensure the id is a valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid ID format" });
        }

        const task = await tasksCollection.findOne({ _id: new ObjectId(id) });

        if (!task) {
          return res.status(404).send({ message: "Task not found" });
        }

        res.send(task);
      } catch (error) {
        console.error("Error fetching task:", error);
        res.status(500).send({ message: "Server error" });
      }
    });

    // PUT /tasks/:id - Update a task (for edits, reordering, or moving)
    app.put("/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id; // Extracts the task ID from the URL
        const filter = { _id: new ObjectId(id) }; // MongoDB filter based on the provided ID
        const updatedTask = req.body; // Get the updated task details from the request body

        const task = {
          $set: {
            title: updatedTask.title,
            description: updatedTask.description,
            status: updatedTask.status,
            createdAt: new Date(), // Update the createdAt field
          },
        };

        // Ensure the task exists before updating
        const result = await tasksCollection.updateOne(filter, task, {
          upsert: true,
        });

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "Task not found" });
        }

        // Send back the update result
        res.status(200).send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Internal Server Error" }); // Error handling
      }
    });

    // DELETE /tasks/:id - Delete a task
    app.delete("/tasks/:id", async (req, res) => {
      const { id } = req.params;
      console.log("Received ID to delete:", id); // Log the received ID

      const query = { _id: new ObjectId(id) };

      try {
        const result = await tasksCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ message: "task application not found" });
        }

        res
          .status(200)
          .json({ message: "task application deleted successfully" });
      } catch (error) {
        console.error("Error deleting task application:", error);
        res.status(500).json({
          message: "An error occurred while deleting the task application",
        });
      }
    });

    // Server Test Endpoint
    app.get("/", (req, res) => {
      res.send("Task Management API is running!");
    });

    console.log("Server is ready!");
  } catch (error) {
    console.error("Error running the server:", error);
  }
}

// Run the server
run().catch(console.error);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
