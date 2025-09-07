const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware setup
app.use(cors());
app.use(express.json());

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_user}:${process.env.DB_pass}@cluster0.8ww6tl6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB and define collections
    // await client.connect();
    const db = client.db("asmaktab");
    const coursesCollection = db.collection("allCourses");
    const tutorsCollection = db.collection("allTutors");
    const usersCollection = db.collection("allUsers");
    const purchaseCollection = db.collection("purchases");
    const demoBookingsCollection = db.collection("demoBookings");
    const paymentHistoryCollection = db.collection("paymentHistory");
    const testimonialsCollection = db.collection("testimonials")
    const pdfsCollection = db.collection("pdfs")
    const recentStudents = db.collection("recentStudents")



    // Middleware to verify JWT
    const verifyToken = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).send({ success: false, message: "No token provided" });
      }
      const token = authHeader.split(" ")[1];
      //console.log("Token received:", token); // Debugging line
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ success: false, message: "Invalid token" });
        }
        req.user = decoded; // Standardized on req.user
        //console.log("Decoded user:", decoded); // Debugging line
        next();
      });
    };

    // Middleware to verify if user is admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      if (!email) {
        return res.status(401).send({ success: false, message: "Unauthorized" });
      }
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "admin") {
        return res.status(403).send({ success: false, message: "Forbidden access" });
      }
      next();
    };

    // Middleware to verify if user is tutor
    const verifyTutor = async (req, res, next) => {
      const email = req.user?.email;
      if (!email) {
        return res.status(401).send({ success: false, message: "Unauthorized" });
      }
      const user = await usersCollection.findOne({ email });
      if (user?.role !== "tutor") {
        return res.status(403).send({ success: false, message: "Forbidden access" });
      }
      next();
    };

    // Discount calculation middleware
    const applyFamilyDiscount = async (req, res, next) => {
      const userId = req.user._id;

      const user = await usersCollection.findOne({ _id: userId });
      if (user?.familyGroup) {
        const group = await usersCollection.findOne({
          "familyGroup.groupId": user.familyGroup.groupId,
          "familyGroup.status": "approved"
        });

        if (group) {
          req.discount = group.familyGroup.discount || 0;
        }
      }

      next();
    };

    // ---------------- JWT Endpoint ----------------

    // Generate JWT token
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    // ---------------- Tutors Endpoints ----------------

    // Get all tutors
    app.get("/allTutors", async (req, res) => {
      try {
        const result = await tutorsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching tutors:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Get course by ID
    app.get("/tutor/:id", async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const tutor = await tutorsCollection.findOne({ _id: new ObjectId(id) });
        if (!tutor) {
          return res.status(404).send({ success: false, message: "Tutor not found" });
        }
        res.send(tutor);
      } catch (error) {
        console.error(`Error fetching tutor ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Post a new tutor
    app.post("/newTutor", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const tutor = req.body;
        const result = await tutorsCollection.insertOne(tutor);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding tutor:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // patch to update tutor information
    app.patch("/tutors/:id", verifyToken, verifyAdmin, async (req, res) => {
      const tutorId = req.params.id;
      const updatedData = req.body;

      try {
        const result = await tutorsCollection.updateOne(
          { _id: new ObjectId(tutorId) },
          { $set: updatedData }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Tutor updated successfully." });
        } else {
          res.send({ success: false, message: "No changes were made." });
        }
      } catch (error) {
        console.error("Error updating tutor:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });


    // Assign a course to a tutor
    app.patch("/tutors/assignCourse/:id", verifyToken, verifyAdmin, async (req, res) => {
      const tutorId = req.params.id;
      const { courseId } = req.body;
      try {
        if (!ObjectId.isValid(tutorId) || !ObjectId.isValid(courseId)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await tutorsCollection.updateOne(
          { _id: new ObjectId(tutorId) },
          { $addToSet: { assignedCourses: new ObjectId(courseId) } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Course assigned to tutor" });
        } else {
          res.status(404).send({ success: false, message: "Tutor not found or course already assigned" });
        }
      } catch (error) {
        console.error(`Error assigning course to tutor ${tutorId}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Assign a demo class to a tutor
    app.patch("/tutors/assignDemo/:id", verifyToken, verifyAdmin, async (req, res) => {
      const tutorId = req.params.id;
      const { courseId } = req.body;
      try {
        if (!ObjectId.isValid(tutorId) || !ObjectId.isValid(courseId)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await tutorsCollection.updateOne(
          { _id: new ObjectId(tutorId) },
          { $addToSet: { assignedDemoClass: new ObjectId(courseId) } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Demo class assigned to tutor" });
        } else {
          res.status(404).send({ success: false, message: "Tutor not found or demo class already assigned" });
        }
      } catch (error) {
        console.error(`Error assigning demo class to tutor ${tutorId}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // delete a tutor
    app.delete("/tutors/delete/:id", verifyToken, verifyAdmin, async (req, res) => {
      const tutorId = req.params.id;
      try {
        if (!ObjectId.isValid(tutorId)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await tutorsCollection.deleteOne({ _id: new ObjectId(tutorId) });
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Tutor deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Tutor not found" });
        }
      } catch (error) {
        console.error(`Error deleting tutor ${tutorId}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    app.get("/assignedCourses", verifyToken, async (req, res) => {
      const tutorEmail = req.query.tutorEmail;

      if (req.user?.email !== tutorEmail) {
        return res.status(403).send({ success: false, message: "Unauthorized access" });
      }

      try {
        // 1. Get tutor info by email
        const tutor = await tutorsCollection.findOne({ email: tutorEmail });

        if (!tutor) {
          return res.status(404).send({ success: false, message: "Tutor not found" });
        }

        // 2. Extract assignedCourses array
        const assignedCourseIds = tutor.assignedCourses || [];

        if (assignedCourseIds.length === 0) {
          return res.send([]); // No assigned courses
        }

        // 3. Fetch full purchase details from purchaseCollection
        const assignedCourses = await purchaseCollection
          .find({ _id: { $in: assignedCourseIds.map(id => new ObjectId(id)) } })
          .toArray();

        res.send(assignedCourses);
      } catch (error) {
        console.error("Error fetching assigned courses:", error);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.get("/assignedDemoClasses", verifyToken, async (req, res) => {
      const tutorEmail = req.query.tutorEmail;

      // Check if request is coming from the logged-in tutor
      if (req.user?.email !== tutorEmail) {
        return res.status(403).send({ success: false, message: "Unauthorized access" });
      }

      try {
        // 1. Get tutor by email
        const tutor = await tutorsCollection.findOne({ email: tutorEmail });

        if (!tutor) {
          return res.status(404).send({ success: false, message: "Tutor not found" });
        }

        // 2. Get assigned demo class IDs
        const assignedDemoClassIds = tutor.assignedDemoClass || [];

        if (assignedDemoClassIds.length === 0) {
          return res.send([]); // No demo classes assigned
        }

        // 3. Fetch demo class details
        const demoClasses = await demoBookingsCollection
          .find({ _id: { $in: assignedDemoClassIds.map(id => new ObjectId(id)) } })
          .toArray();

        res.send(demoClasses);
      } catch (error) {
        console.error("Error fetching demo classes:", error);
        res.status(500).send({ success: false, message: "Internal server error" });
      }
    });

    //get all recent students
    app.get("/recentStudents", async (req, res) => {
      try {
        const result = await recentStudents.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching recent students:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    //post a recent student
    app.post("/newRecentStudent", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const recentStudent = req.body;
        const result = await recentStudents.insertOne(recentStudent);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error adding recent student:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    //delete a recent student
    app.delete("/recentStudents/delete/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await recentStudents.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Recent student deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Recent student not found" });
        }
      } catch (error) {
        console.error(`Error deleting recent student ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    //------------------------- Courses Endpoints ------------------------------//
    // Get all courses
    app.get("/allCourses", async (req, res) => {
      try {
        const result = await coursesCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });


    // Get course by ID
    app.get("/courses/:id", async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const course = await coursesCollection.findOne({ _id: new ObjectId(id) });
        if (!course) {
          return res.status(404).send({ success: false, message: "Course not found" });
        }
        res.send(course);
      } catch (error) {
        console.error(`Error fetching course ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Update course featured status
    app.patch("/courses/featured/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { featured } = req.body;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await coursesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { featured } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Course featured status updated" });
        } else {
          res.status(404).send({ success: false, message: "Course not found or no changes made" });
        }
      } catch (error) {
        console.error(`Error updating featured status for course ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Update course details
    app.patch("/courses/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await coursesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Course updated" });
        } else {
          res.status(404).send({ success: false, message: "Course not found or no changes made" });
        }
      } catch (error) {
        console.error(`Error updating course ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Delete a course
    app.delete("/courses/delete/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await coursesCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Course deleted" });
        } else {
          res.status(404).send({ success: false, message: "Course not found" });
        }
      } catch (error) {
        console.error(`Error deleting course ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // ---------------- Users Endpoints ----------------

    // Get all users (admin only)
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await usersCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Get current user information
    app.get("/users/me", verifyToken, async (req, res) => {
      const email = req.user?.email;
      //console.log("Fetching user, email:", email); // Debugging line
      try {
        if (!email) {
          return res.status(401).send({ success: false, message: "Unauthorized" });
        }
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ success: false, message: "User not found" });
        }
        res.send(user);
      } catch (error) {
        console.error(`Error fetching user ${email}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Check if current user is admin
    app.get("/users/isAdmin", verifyToken, async (req, res) => {
      const email = req.user?.email;
      //console.log("Checking admin, email:", email); // Debugging line
      try {
        if (!email) {
          return res.status(401).send({ success: false, message: "Unauthorized" });
        }
        const user = await usersCollection.findOne({ email });
        const isAdmin = user?.role === "admin";
        res.send({ admin: isAdmin });
      } catch (error) {
        console.error(`Error checking admin status for ${email}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Check if current user is tutor
    app.get("/users/isTutor", verifyToken, async (req, res) => {
      const email = req.user?.email;
      //console.log("Checking tutor, email:", email); // Debugging line
      try {
        if (!email) {
          return res.status(401).send({ success: false, message: "Unauthorized" });
        }
        const user = await usersCollection.findOne({ email });
        const isTutor = user?.role === "tutor";
        res.send({ tutor: isTutor });
      } catch (error) {
        console.error(`Error checking tutor status for ${email}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    app.post("/users", async (req, res) => {
      try {
        const { name, PhoneNo, email, password, referredBy } = req.body;
        // Validate required fields
        if (!name || !email || !password) {
          return res.status(400).json({
            success: false,
            message: "Name, email and password are required"
          });
        }
        // Check if user exists
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: "User already exists"
          });
        }
        // Generate referral code
        const referralCode = generateReferralCode(name);
        let referredById = null;
        if (referredBy) {
          const referrer = await usersCollection.findOne({ referralCode: referredBy });
          if (referrer) {
            referredById = referrer._id;
            // //console.log(`User ${email} referred by ${referrer.email}`);
          }
        }
        // Create user document
        const userDoc = {
          name,
          email,
          PhoneNo,
          password,
          referralCode,
          referredBy: referredById,
          siblingGroupId: null,
          referralCount: 0,
          totalReferralDiscount: 0,
          role: "user",
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await usersCollection.insertOne(userDoc);
        const insertedUser = await usersCollection.findOne({ _id: result.insertedId });
        res.status(201).json({
          success: true,
          insertedId: result.insertedId,
          referralCode: insertedUser.referralCode,
          referredBy: insertedUser.referredBy
        });

        if (referredById) {
          await usersCollection.updateOne(
            { _id: referredById },
            {
              $inc: {
                referralCount: 1,
              }
            }
          );
        }

      } catch (error) {
        console.error("User creation error:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
          error: error.message
        });
      }
    });

    //Referral code generator
    function generateReferralCode(name = 'USER') {
      const cleanName = name
        .toString()
        .trim()
        .toUpperCase()
        .split(/\s+/)[0]
        .replace(/[^A-Z]/g, '');

      const letters = cleanName.padEnd(5, 'X');
      const numbers = Math.floor(1000 + Math.random() * 9000);

      return `${letters}${numbers}`;
    }

    app.get('/users/validateReferral', verifyToken, async (req, res) => {
      try {
        const { code, userId } = req.query;

        if (!code) {
          return res.status(400).json({
            success: false,
            message: 'Referral code is required'
          });
        }

        // Find the current user to check if they're trying to use their own code
        const currentUser = await usersCollection.findOne({ email: userId });
        if (currentUser?.referralCode === code) {
          return res.status(400).json({
            success: false,
            message: 'You cannot use your own referral code'
          });
        }

        // Find user with this referral code
        const referrer = await usersCollection.findOne({ referralCode: code });

        if (!referrer) {
          return res.status(404).json({
            success: false,
            message: 'Invalid referral code'
          });
        }

        // Additional checks can be added here:
        // - Check if code is expired
        // - Check if code has reached its usage limit
        // - Check if the current user has already used this code before

        res.json({
          success: true,
          message: 'Referral code is valid',
          referrerId: referrer._id
        });

      } catch (error) {
        console.error('Error validating referral code:', error);
        res.status(500).json({
          success: false,
          message: 'Server error while validating referral code'
        });
      }
    });

    // Update user information
    app.patch("/users/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (email !== req.user.email) {
          return res.status(403).send({ success: false, message: "Unauthorized access" });
        }
        const updates = req.body;
        const result = await usersCollection.updateOne(
          { email },
          { $set: updates }
        );
        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: "User not found" });
        }
        res.send({
          success: true,
          message: result.modifiedCount > 0 ? "User updated successfully" : "No changes made",
        });
      } catch (error) {
        console.error(`Error updating user ${email}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Update user role (admin only)
    app.patch("/users/role/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;

      if (!["admin", "tutor", "user"].includes(role)) {
        return res.status(400).send({ success: false, message: "Invalid role" });
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );

      if (result.modifiedCount > 0) {
        res.send({ success: true, message: `Role updated to ${role}` });
      } else {
        res.status(404).send({ success: false, message: "User not found or already in this role" });
      }
    });

    // Delete a user (admin only)
    app.delete("/users/delete/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.send({ success: true, message: "User deleted" });
        } else {
          res.status(404).send({ success: false, message: "User not found" });
        }
      } catch (error) {
        console.error(`Error deleting user ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // ----------------- Sibling  or Family Group Endpoints -----------------

    //Family Group Create

    app.post('/family/createGroup', verifyToken, async (req, res) => {
      const { userId } = req.body;

      try {
        // 1. Validate userId
        if (!userId || !ObjectId.isValid(userId)) {
          return res.status(400).json({
            success: false,
            message: "Invalid user ID"
          });
        }

        // 2. Check if user already has a group
        const user = await usersCollection.findOne({
          _id: new ObjectId(userId),
          "familyGroup.groupId": { $exists: true }
        });

        if (user?.familyGroup) {
          return res.status(400).json({
            success: false,
            message: "আপনি ইতিমধ্যেই একটি Family Group-এর সদস্য"
          });
        }

        // 3. Generate unique group ID (checking for duplicates)
        let groupId;
        let exists = true;
        while (exists) {
          groupId = `FAM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          exists = await usersCollection.findOne({ "familyGroup.groupId": groupId });
        }

        // 4. Update user document in allUsers collection
        await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          {
            $set: {
              familyGroup: {
                groupId,
                status: "pending",
                createdBy: new ObjectId(userId),
                members: [new ObjectId(userId)],
                createdAt: new Date()
              }
            }
          }
        );

        // 5. Send success response
        res.json({
          success: true,
          groupId,
          message: "Family Group তৈরি হয়েছে! Admin-এর অনুমোদনের জন্য অপেক্ষা করুন।"
        });

      } catch (error) {
        console.error("Create Group Error:", error);
        res.status(500).json({
          success: false,
          message: "সার্ভার সমস্যা"
        });
      }
    });

    //Join Existing Family Group
    app.post('/family/joinGroup', verifyToken, async (req, res) => {
      const { groupId, userId } = req.body;

      try {
        if (!groupId || !userId) {
          return res.status(400).json({ success: false, message: "Group ID এবং User ID দিতে হবে" });
        }

        const currentUser = await usersCollection.findOne({
          _id: new ObjectId(userId),
          "familyGroup.groupId": { $exists: true }
        });

        if (currentUser) {
          return res.status(400).json({ success: false, message: "আপনি ইতিমধ্যেই অন্য গ্রুপে আছেন" });
        }

        const groupOwner = await usersCollection.findOne({ "familyGroup.groupId": groupId });

        if (!groupOwner) {
          return res.status(404).json({ success: false, message: "এই Group ID টি সঠিক নয়" });
        }

        if (groupOwner.familyGroup.status !== "approved") {
          return res.status(400).json({ success: false, message: "এই গ্রুপটি এখনও Admin দ্বারা অনুমোদিত হয়নি" });
        }

        const alreadyRequested = groupOwner.familyGroup.requests?.some(
          req => req.userId.equals(new ObjectId(userId))
        );

        if (alreadyRequested) {
          return res.status(400).json({ success: false, message: "আপনি ইতিমধ্যেই রিকুয়েস্ট পাঠিয়েছেন" });
        }

        await usersCollection.updateOne(
          { "familyGroup.groupId": groupId },
          {
            $push: {
              "familyGroup.requests": {
                userId: new ObjectId(userId),
                requestedAt: new Date(),
                status: "pending"
              }
            }
          }
        );

        res.json({
          success: true,
          message: "গ্রুপে যোগদানের রিকুয়েস্ট পাঠানো হয়েছে! Admin-এর অনুমোদনের জন্য অপেক্ষা করুন।"
        });

      } catch (error) {
        console.error("Error joining group:", error);
        res.status(500).json({ success: false, message: "সার্ভার সমস্যা", error: error.message });
      }
    });

    // POST /family/approveRequest
    app.post("/family/approveRequest", verifyToken, async (req, res) => {
      const { groupId, userId } = req.body;
      //console.log("Approve Request Body:", req.body);

      try {
        // 1. Validate
        if (!groupId || !userId) {
          return res.status(400).json({ success: false, message: "Missing data" });
        }

        // 2. Find group owner
        const groupOwner = await usersCollection.findOne({ "familyGroup.groupId": groupId });
        if (!groupOwner) {
          return res.status(404).json({ success: false, message: "Group not found" });
        }

        // 3. Check if request exists
        const requestIndex = groupOwner.familyGroup.requests?.findIndex(
          (req) => req.userId.toString() === userId
        );
        if (requestIndex === -1) {
          return res.status(400).json({ success: false, message: "Request not found" });
        }

        // 4. Find requesting user
        const userObj = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!userObj) {
          return res.status(404).json({ success: false, message: "User not found" });
        }

        // 5. Add user to owner's group members with full info
        const memberInfo = {
          userId: userObj._id,
          name: userObj.name,
          email: userObj.email,
          fatherName: userObj.fatherName,
          joinedAt: new Date(),
        };

        await usersCollection.updateOne(
          { "familyGroup.groupId": groupId },
          { $push: { "familyGroup.members": memberInfo } }
        );

        // 6. Update user's own familyGroup
        await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          {
            $set: {
              familyGroup: {
                groupId,
                status: "approved",
                createdBy: groupOwner._id,
                members: [memberInfo],
                createdAt: new Date(),
              },
            },
          }
        );

        // 7. Remove request from owner's requests array
        groupOwner.familyGroup.requests.splice(requestIndex, 1);
        await usersCollection.updateOne(
          { _id: groupOwner._id },
          { $set: { "familyGroup.requests": groupOwner.familyGroup.requests } }
        );

        res.json({
          success: true,
          message: `${userObj.name} has been added to the family group`,
          member: memberInfo,
        });
      } catch (error) {
        console.error("Approve Request Error:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
      }
    });

    // ---------------- Purchase Endpoints ----------------

    // Get all purchases (admin only)
    app.get("/allPurchase", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const result = await purchaseCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching all purchases:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Get all purchases for a specific student
    app.get("/myPurchases", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required" });
        }
        if (email !== req.user.email) {
          return res.status(403).send({ success: false, message: "Unauthorized access" });
        }
        const query = { studentEmail: email };
        const purchases = await purchaseCollection.find(query).toArray();
        res.send(purchases);
      } catch (error) {
        console.error(`Error fetching purchases for ${email}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Create a new purchase
    app.post("/purchase", verifyToken, async (req, res) => {
      try {
        const data = req.body;
        const result = await purchaseCollection.insertOne({
          ...data,
          studentEmail: req.user.email,
          confirmed: false,
          denied: false,
          createdAt: new Date(),
        });
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating purchase:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Confirm a purchase
    app.patch("/purchases/confirm/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { tutorId } = req.body;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            confirmed: true,
            denied: false,
            assignedTutorId: tutorId ? new ObjectId(tutorId) : null,
            updatedAt: new Date(),
          },
        };
        const result = await purchaseCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          if (tutorId) {
            await tutorsCollection.updateOne(
              { _id: new ObjectId(tutorId) },
              { $addToSet: { assignedCourses: new ObjectId(id) } }
            );
          }
          res.send({ success: true, message: "Purchase confirmed" });
        } else {
          res.status(404).send({ success: false, message: "Purchase not found or already confirmed" });
        }
      } catch (error) {
        console.error(`Error confirming purchase ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Deny a purchase
    app.patch("/purchases/deny/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await purchaseCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { denied: true, updatedAt: new Date() } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Purchase denied" });
        } else {
          res.status(404).send({ success: false, message: "Purchase not found or already denied" });
        }
      } catch (error) {
        console.error(`Error denying purchase ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    app.patch('/studentReview/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { answers, comments } = req.body;

        // 1. First check if review exists today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const existingReview = await purchaseCollection.findOne({
          _id: new ObjectId(id),
          "studentReview": {
            $elemMatch: {
              createdAt: { $gte: todayStart, $lte: todayEnd }
            }
          }
        });

        if (existingReview) {
          return res.status(400).json({
            error: 'আপনি আজকে ইতিমধ্যে একটি রিভিউ দিয়েছেন! প্রতিদিন শুধুমাত্র একটি রিভিউ দেওয়া যাবে'
          });
        }

        // 2. Proceed with adding review if no existing review today
        const result = await purchaseCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $push: {
              studentReview: {
                answers,
                comments,
                createdAt: new Date()
              }
            }
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: 'Purchase খুঁজে পাওয়া যায়নি' });
        }

        res.json({ success: true, message: 'রিভিউ সাবমিট হয়েছে!' });

      } catch (err) {
        console.error('হয়রানি:', err);
        res.status(500).json({ error: 'সার্ভার এরর' });
      }
    });

    //tutor review option
    app.patch('/tutorReview/:id', async (req, res) => {
      try {
        const id = req.params;
        const { answers, comments } = req.body;

        // 1. First check if review exists today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const existingReview = await purchaseCollection.findOne({
          _id: new ObjectId(id),
          "studentReview": {
            $elemMatch: {
              createdAt: { $gte: todayStart, $lte: todayEnd }
            }
          }
        });

        if (existingReview) {
          return res.status(400).json({
            error: 'আপনি আজকে ইতিমধ্যে একটি রিভিউ দিয়েছেন!'
          });
        }


        // Database operation
        const result = await purchaseCollection.updateOne(
          { _id: new ObjectId(id) }, // purchaseId দিয়ে খুঁজছি
          {
            $push: {
              tutorReview: {
                answers,
                comments,
                createdAt: new Date()
              }
            }
          }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: 'Purchase খুঁজে পাওয়া যায়নি' });
        }

        res.json({ success: true, message: 'রিভিউ সাবমিট হয়েছে!' });

      } catch (err) {
        console.error('হয়রানি:', err);
        res.status(500).json({ error: 'সার্ভার এরর' });
      }
    });

    // ---------------- Demo Booking Endpoints ----------------

    // Get all demo bookings (admin or student)
    app.get("/demoBookings", verifyToken, async (req, res) => {
      try {
        const email = req.query.email;
        if (email && email !== req.user.email && !req.user.isAdmin) {
          return res.status(403).send({ success: false, message: "Unauthorized access" });
        }
        const query = email ? { studentEmail: email } : {};
        const bookings = await demoBookingsCollection.find(query).toArray();
        res.send(bookings);
      } catch (error) {
        console.error(`Error fetching demo bookings for ${email || "all"}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Create a new demo booking
    app.post("/demoBookings", verifyToken, async (req, res) => {
      try {
        const data = req.body;
        const result = await demoBookingsCollection.insertOne({
          ...data,
          studentEmail: req.user.email,
          confirmed: false,
          createdAt: new Date(),
        });
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error creating demo booking:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Confirm a demo booking
    app.patch("/demoBookings/confirm/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { tutorId } = req.body;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            confirmed: true,
            assignedTutorId: tutorId ? new ObjectId(tutorId) : null,
            updatedAt: new Date(),
          },
        };
        const result = await demoBookingsCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Demo booking confirmed" });
        } else {
          res.status(404).send({ success: false, message: "Booking not found or already confirmed" });
        }
      } catch (error) {
        console.error(`Error confirming demo booking ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Deny a demo booking
    app.patch("/demoBookings/deny/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const result = await demoBookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { denied: true, updatedAt: new Date() } }
        );
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Demo booking denied" });
        } else {
          res.status(404).send({ success: false, message: "Booking not found or already denied" });
        }
      } catch (error) {
        console.error(`Error denying demo booking ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // ---------------- Payment Endpoints ----------------

    // Submit payment details
    app.post("/payments/submit", verifyToken, applyFamilyDiscount, async (req, res) => {
      try {
        const { courseId, month, year, transactionId, paymentMethod, senderInfo, amount, courseName } = req.body;
        const studentEmail = req.user.email;
        const student = await usersCollection.findOne({ email: studentEmail });
        if (!student) {
          return res.status(404).send({ success: false, message: "Student not found" });
        }
        if (!ObjectId.isValid(courseId)) {
          return res.status(400).send({ success: false, message: "Invalid course ID" });
        }
        const paymentData = {
          studentEmail,
          studentName: student.name || req.user.name,
          courseId: new ObjectId(courseId),
          courseName,
          month,
          year,
          amount: parseFloat(amount),
          paymentDate: null,
          status: "submitted",
          transactionId: transactionId || null,
          paymentMethod,
          senderInfo,
          createdAt: new Date(),
        };
        const result = await paymentHistoryCollection.insertOne(paymentData);
        res.status(201).send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        console.error("Error submitting payment:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Confirm a payment
    app.patch("/payments/confirm/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "paid",
            paymentDate: new Date(),
            updatedAt: new Date(),
          },
        };
        const result = await paymentHistoryCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Payment confirmed successfully" });
        } else {
          res.status(404).send({ success: false, message: "Payment not found or already confirmed" });
        }
      } catch (error) {
        console.error(`Error confirming payment ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Mark a payment as overdue
    app.patch("/payments/denied/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      try {
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: "Invalid ID format" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: "denied",
            updatedAt: new Date(),
          },
        };
        const result = await paymentHistoryCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Payment marked as overdue" });
        } else {
          res.status(404).send({ success: false, message: "Payment not found or already overdue" });
        }
      } catch (error) {
        console.error(`Error marking payment overdue ${id}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Fetch payment history for a student
    app.get("/payments/student/:email", verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        if (!req.user) {
          return res.status(401).send({ success: false, message: "Invalid token" });
        }
        if (email !== req.user.email && !req.user.isAdmin) {
          return res.status(403).send({ success: false, message: "Unauthorized access" });
        }
        if (!paymentHistoryCollection) {
          return res.status(500).send({ success: false, message: "Database collection not initialized" });
        }
        const query = { studentEmail: email };
        const payments = await paymentHistoryCollection.find(query).toArray();
        res.send(payments);
      } catch (error) {
        console.error(`Error fetching payments for ${email}:`, error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    // Fetch all payment records (admin only)
    app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const payments = await paymentHistoryCollection.find().toArray();
        res.send(payments);
      } catch (error) {
        console.error("Error fetching all payments:", error);
        res.status(500).send({ success: false, message: `Server error: ${error.message}` });
      }
    });

    //testimonials endpoints

    app.get("/testimonials", async (req, res) => {
      try {
        const testimonials = await testimonialsCollection.find().toArray();
        res.send(testimonials);
      } catch (err) {
        console.error("Error fetching testimonials:", err);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    app.post("/testimonials", verifyToken, async (req, res) => {
      const testimonial = req.body;

      if (!testimonial.name || !testimonial.message) {
        return res.status(400).send({ success: false, message: "Missing fields" });
      }

      try {
        const result = await testimonialsCollection.insertOne(testimonial);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (err) {
        console.error("Error saving testimonial:", err);
        res.status(500).send({ success: false, message: "Server error" });
      }
    });

    // Delete a testimonial by ID
    app.delete("/testimonials/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await testimonialsCollection.deleteOne({
          _id: new ObjectId(id)
        });

        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Testimonial deleted successfully"
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Testimonial not found"
          });
        }
      } catch (error) {
        console.error("Error deleting testimonial:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete testimonial",
          error: error.message
        });
      }
    });

    // Update a testimonial by ID
    app.patch("/testimonials/:id", async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;

      try {
        // Validate the update data
        const allowedFields = ["name", "designation", "message", "gender"];
        const isValidUpdate = Object.keys(updateData).every(field =>
          allowedFields.includes(field)
        );

        if (!isValidUpdate) {
          return res.status(400).json({
            success: false,
            message: "Invalid update fields"
          });
        }

        const result = await testimonialsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Testimonial updated successfully",
            updatedFields: Object.keys(updateData)
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Testimonial not found"
          });
        }
      } catch (error) {
        console.error("Error updating testimonial:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update testimonial",
          error: error.message
        });
      }
    });
    //----------------PDF Related Endpoints---------------//\
    //post a new pdf
    app.post('/pdf', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { name, driveLink, formattedLink, category } = req.body; // Accept formattedLink from frontend

        const newPdf = {
          name,
          driveLink,
          formattedLink, // Trust the frontend's formatting
          category,
          isHidden: false,
          createdAt: new Date()
        };

        const result = await pdfsCollection.insertOne(newPdf);
        res.status(201).json({ _id: result.insertedId, ...newPdf });
      } catch (err) {
        res.status(500).json({ error: 'Failed to upload PDF' });
      }
    });

    //get all pdfs
    app.get('/pdfs', async (req, res) => {
      try {
        const pdfs = await pdfsCollection.find().toArray();
        res.status(200).json(pdfs);
      } catch (err) {
        res.status(500).json({ error: 'Failed to fetch PDFs' });
      }
    });

    app.delete("/pdf/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await pdfsCollection.deleteOne({
          _id: new ObjectId(id)
        });

        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "PDF deleted successfully"
          });
        } else {
          res.status(404).json({
            success: false,
            message: "PDF not found"
          });
        }
      } catch (error) {
        console.error("Error deleting PDF:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete PDF",
          error: error.message
        });
      }
    });



  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // Exit if connection fails
  }
}
run().catch(console.dir);

// Default route
app.get("/", (req, res) => {
  res.send("After School Maktab is running");
});

// Start server
app.listen(port, () => {
  console.log(`After School Maktab is running on port ${port}`);
});