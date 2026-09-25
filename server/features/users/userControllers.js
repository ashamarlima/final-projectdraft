const mongoose = require('mongoose');
const User = require('./userModels');
const ClassModel = require('./Class');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const {
    gradeXp,
    levelForXp
} = require('../../shared/xp');

const {
    setAuthCookie,
    clearAuthCookie
} = require('../../shared/authMiddleware');

//get status
// In controllers/userController.js

exports.getStatus = async (req, res) => {
    try {
        const total = await User.countDocuments();
        const active = await User.countDocuments({ status: 'active' });
        const inactive = await User.countDocuments({ status: 'inactive' });

        // Combined into a single, clean JSON object response
        return res.status(200).json({
            total,
            active,
            inactive,
            message: "Server is working!"
        });
    } catch (error) {
        return res.status(500).json({ message: "Error" });
    }
};

 
 
//escape regex special characters in user-supplied search input
const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

//Pagination guards, in one place so every list endpoint applies the same
//ones: a page is always at least 1 (a negative page would turn into a
//negative skip) and a page is never larger than this, so a crafted
//?limit= cannot pull the whole collection into one response.
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function pagination(query = {}) {
    const requestedPage = parseInt(query.page, 10);
    const requestedLimit = parseInt(query.limit, 10);

    const page =
        Number.isFinite(requestedPage) && requestedPage > 0
            ? requestedPage
            : 1;

    const limit =
        Number.isFinite(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, MAX_PAGE_SIZE)
            : DEFAULT_PAGE_SIZE;

    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
}

//search
//search

exports.searchUsers = async (req, res) => {
    try {
        const query = req.params.query;
        const safeQuery = escapeRegex(query);
        const { page, limit, skip } = pagination(req.query);

        //get classroom and role filters
        const { classroom, role } = req.query;

        const SearchQuery = {
            $or: [
                { name: { $regex: safeQuery, $options: 'i' } },
                { email: { $regex: safeQuery, $options: 'i' } },
                { phone: { $regex: safeQuery, $options: 'i' } },
                { status: { $regex: safeQuery, $options: 'i' } }
            ],
        };

        //add classroom filter when selected
        if (classroom) {
            SearchQuery.classroom = classroom;
        }

        //add role filter when selected
        if (role) {
            SearchQuery.role = role;
        }

        const users = await User.find(SearchQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await User.countDocuments(SearchQuery);

        return res.status(200).json({
            users,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalUsers: total,
        });

    } catch (error) {
        return res.status(500).json({
            message: "Error"
        });
    }
};
 

//all users

exports.getAllUsers = async (req, res) => {
    try {
        const { page, limit, skip } = pagination(req.query);

        //get classroom and role from URL query
        const { classroom, role } = req.query;

        //create MongoDB filter
        const filter = {};

        if (classroom) {
            filter.classroom = classroom;
        }

        if (role) {
            filter.role = role;
        }

        const users = await User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await User.countDocuments(filter);

        return res.status(200).json({
            users,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalUsers: total,
        });

    } catch (error) {
        return res.status(500).json({
            message: "Error"
        });
    }
};

// Class Management Controllers

exports.createClass = async (req, res) => {
    try {
        const { name, grade, teacher } = req.body;

        if (!name || !grade || !teacher) {
            return res.status(400).json({ message: "Please provide name, grade, and teacher" });
        }

        //reject malformed ids before they reach the database
        if (!mongoose.isValidObjectId(teacher)) {
            return res.status(400).json({
                message: "The assigned teacher id is not valid"
            });
        }

        //a class can only be assigned to an existing teacher
        const teacherUser = await User.findById(teacher);

        if (!teacherUser) {
            return res.status(404).json({
                message: "Teacher not found"
            });
        }

        if (teacherUser.role !== "teacher") {
            return res.status(400).json({
                message: "The assigned user must have the teacher role"
            });
        }

        const newClass = await ClassModel.create({
            name,
            grade,
            teacher
        });

        return res.status(201).json({
            success: true,
            data: newClass,
            message: "Class created successfully"
        });
    } catch (error) {
        return res.status(500).json({ message: "Error creating class" });
    }
};

exports.getAllClasses = async (req, res) => {
    try {
        //populate the teacher so the client can show a name
        //instead of a raw ObjectId
        const classes = await ClassModel.find()
            .populate('teacher', 'name email');

        return res.status(200).json({ success: true, data: classes });
    } catch (error) {
        return res.status(500).json({ message: 'Error' });
    }
};

//all teachers, used to populate the class-assignment dropdown
//(not paginated: the client needs every teacher, not one page)

exports.getAllTeachers = async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' })
            .select('name email')
            .sort({ name: 1 });

        return res.status(200).json({ teachers });
    } catch (error) {
        return res.status(500).json({
            message: "Error"
        });
    }
};

//leaderboard of the active students in the requester's own grade
//level (the classroom field holds the grade: 9-12)

exports.getLeaderboard = async (req, res) => {
    try {
        const classroom = String(
            req.user?.classroom || ""
        ).trim();

        if (!classroom) {
            return res.status(400).json({
                message:
                    "You are not assigned to a grade level"
            });
        }

        const students = await User.find({
            role: "student",
            classroom,
            status: "active"
        })
            .select("name classroom xp")
            .sort({ xp: -1, name: 1 });

        const currentId = String(
            req.user?._id || req.user?.id
        );

        let leaderboard = students.map(
            (student, index) => ({
                _id: student._id,
                name: student.name,
                classroom: student.classroom,
                xp: student.xp || 0,
                level: levelForXp(student.xp),
                rank: index + 1,

                isCurrentUser:
                    String(student._id) ===
                    currentId
            })
        );

        //the requester is always shown, even when they are inactive
        //or outside the query above
        if (
            !leaderboard.some(
                (entry) => entry.isCurrentUser
            )
        ) {
            const myXp = req.user?.xp || 0;

            const ahead = await User.countDocuments({
                role: "student",
                classroom,
                status: "active",
                xp: { $gt: myXp }
            });

            leaderboard = [
                ...leaderboard,
                {
                    _id: req.user._id,
                    name: req.user.name,
                    classroom,
                    xp: myXp,
                    level: levelForXp(myXp),
                    rank: ahead + 1,
                    isCurrentUser: true
                }
            ].sort((first, second) =>
                first.rank - second.rank
            );
        }

        return res.status(200).json({
            classroom,
            leaderboard
        });

    } catch (error) {
        return res.status(500).json({
            message: "Error"
        });
    }
};

exports.deleteClass = async (req, res) => {
    try {
        const classId = req.params.id;
        const deletedClass = await ClassModel.findByIdAndDelete(classId);

        if (!deletedClass) {
            return res.status(404).json({ message: "Class not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Class deleted successfully"
        });
    } catch (error) {
        console.error("Error in deleteClass:", error);
        return res.status(500).json({ message: "Error deleting class" });
    }
};

//get users by id

exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Fixed: Added response when user is successfully found
        return res.status(200).json({ user });

    } catch (error) {
        return res.status(500).json({ message: "Error" });
    }
};
//create user

exports.createUser = async (req, res) => {
    try {
        const {
            name,
            password,
            email,
            phone,
            status,
            classroom,
            role
        } = req.body;

        if (
            !name ||
            !email ||
            !phone ||
            !password ||
            !classroom ||
            !role
        ) {
            return res.status(400).json({
                message: "Name, email, phone, password, classroom, and role are required"
            });
        }

        //values must match the schema enums, otherwise Mongoose
        //throws a ValidationError that surfaces as a 500
        const validClassrooms = User.schema.path('classroom').enumValues;
        const validRoles = User.schema.path('role').enumValues;

        if (!validClassrooms.includes(String(classroom))) {
            return res.status(400).json({
                message: `Classroom must be one of: ${validClassrooms.join(', ')}`
            });
        }

        if (!validRoles.includes(role)) {
            return res.status(400).json({
                message: `Role must be one of: ${validRoles.join(', ')}`
            });
        }

        const existingUser = await User.findOne({
            $or: [
                { email },
                { phone }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                message: "Email or phone already exists"
            });
        }

        //hash password before saving
        const hashedPassword = await bcrypt.hash(
            password,
            12
        );

        const newUser = new User({
            name,
            email,
            phone,
            password: hashedPassword,
            status: status || "active",
            classroom: String(classroom),
            role: role || "student"
        });

        await newUser.save();

        //remove password hash from response
        const userData = newUser.toObject();
        delete userData.password;

        return res.status(201).json({
            message: "User created successfully",
            user: userData
        });

    } catch (error) {
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

//update user

 
//update user

exports.updateUser = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            status,
            password,
            classroom,
            role
        } = req.body;

        //Values have to match the schema enums, otherwise Mongoose throws
        //a ValidationError that surfaces as a 500. An absent field is
        //left alone (Mongoose drops undefined from the update), but a
        //field that *is* sent has to be usable, which is the same rule
        //createUser applies.
        const validClassrooms =
            User.schema.path('classroom').enumValues;

        const validRoles =
            User.schema.path('role').enumValues;

        const validStatuses =
            User.schema.path('status').enumValues;

        for (const [field, value] of [
            ['name', name],
            ['email', email],
            ['phone', phone]
        ]) {
            if (
                value !== undefined &&
                String(value).trim() === ''
            ) {
                return res.status(400).json({
                    message: `${field} cannot be empty`
                });
            }
        }

        if (
            classroom !== undefined &&
            !validClassrooms.includes(String(classroom))
        ) {
            return res.status(400).json({
                message: `Classroom must be one of: ${validClassrooms.join(', ')}`
            });
        }

        if (
            role !== undefined &&
            !validRoles.includes(role)
        ) {
            return res.status(400).json({
                message: `Role must be one of: ${validRoles.join(', ')}`
            });
        }

        if (
            status !== undefined &&
            !validStatuses.includes(status)
        ) {
            return res.status(400).json({
                message: `Status must be one of: ${validStatuses.join(', ')}`
            });
        }

        if (email) {
            const exists = await User.findOne({
                email,
                _id: { $ne: req.params.id }
            });

            if (exists) {
                return res.status(400).json({
                    message: "Email already exists"
                });
            }
        }

        if (phone) {
            const exists = await User.findOne({
                phone,
                _id: { $ne: req.params.id }
            });

            if (exists) {
                return res.status(400).json({
                    message: "Phone already exists"
                });
            }
        }

        //data that will always be updated
        const updateData = {
            name,
            email,
            phone,
            status,
            classroom,
            role
        };

        //only update and hash password when a new password is entered
        if (password && password.trim() !== "") {
            updateData.password = await bcrypt.hash(password, 12);
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        return res.status(200).json({
            message: "User updated successfully",
            user
        });

    } catch (error) {
        //a malformed id is a client error, anything else is not
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: "That user id is not valid"
            });
        }

        return res.status(500).json({
            message: "Internal server error"
        });
    }
};
//delete user
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ message: "User deleted successfully" });
    }
    catch (error) {
        //a malformed id is a client error, anything else is not. Same
        //split as updateUser above, so DELETE /users/abc answers 400
        //rather than reporting a database failure.
        if (error.name === 'CastError') {
            return res.status(400).json({
                message: "That user id is not valid"
            });
        }

        return res.status(500).json({ message: "Internal server error" });
    }
};
//get filter options

exports.getFilterOptions = async (req, res) => {
    try {
        const classrooms = User.schema.path('classroom').enumValues;
        const roles = User.schema.path('role').enumValues;

        return res.status(200).json({
            classrooms,
            roles
        });

    } catch (error) {
        return res.status(500).json({
            message: "Error"
        });
    }
};

//login user

exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        //check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        //password has select: false, so request it manually
        const user = await User.findOne({
            email: email.trim()
        }).select('+password');

        //do not reveal whether the email or password was wrong
        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        //compare entered password with stored hashed password
        const passwordMatched = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatched) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        //prevent inactive users from logging in
        if (user.status !== "active") {
            return res.status(403).json({
                message: "Your account is inactive"
            });
        }

        //create login token
        const token = jwt.sign(
            {
                id: user._id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || "1d"
            }
        );

        //Set token in an HttpOnly cookie. The token deliberately never
        //reaches the response body, so no script can read it back.
        setAuthCookie(res, token);

        return res.status(200).json({
            message: "Login successful",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                status: user.status,
                classroom: user.classroom,
                role: user.role,
                Math: user.Math,
                Literature: user.Literature,
                Science: user.Science,
                xp: user.xp || 0,
                level: levelForXp(user.xp)
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

//end the session

exports.logoutUser = async (req, res) => {
    try {
        //The browser cannot clear an httpOnly cookie itself, so the
        //server has to. This also has to work for an expired or missing
        //token, which is why the route is public.
        clearAuthCookie(res);

        return res.status(200).json({
            message: "Logged out successfully"
        });

    } catch (error) {
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

//get currently logged-in user

exports.getCurrentUser = async (req, res) => {
    try {
        return res.status(200).json({
            user: req.user
        });

    } catch (error) {
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

//update student grades

exports.updateGrades = async (req, res) => {
    try {
        const {
            Math,
            Literature,
            Science
        } = req.body;

        const student = await User.findById(req.params.id);

        if (!student) {
            return res.status(404).json({
                message: "Student not found"
            });
        }

        if (student.role !== "student") {
            return res.status(400).json({
                message: "Grades can only be assigned to students"
            });
        }

        const grades = {
            Math,
            Literature,
            Science
        };

        //what the current grades are already worth, so the award
        //below only counts the improvement
        const previousGradeXp = gradeXp(student);

        for (const [subject, value] of Object.entries(grades)) {
            if (value === undefined) {
                continue;
            }

            if (value === null || value === "") {
                student[subject] = null;
                continue;
            }

            const grade = Number(value);

            if (
                Number.isNaN(grade) ||
                grade < 0 ||
                grade > 100
            ) {
                return res.status(400).json({
                    message: `${subject} grade must be between 0 and 100`
                });
            }

            student[subject] = grade;
        }

        //grades are worth their own value in XP, so saving the same
        //grades again gains nothing and only an improvement counts.
        //(a ternary, because `Math` above shadows the global object)
        const updatedGradeXp = gradeXp(student);

        const gradeXpGained =
            updatedGradeXp > previousGradeXp
                ? updatedGradeXp - previousGradeXp
                : 0;

        if (gradeXpGained > 0) {
            student.xp =
                (student.xp || 0) + gradeXpGained;
        }

        await student.save();

        return res.status(200).json({
            message: "Grades updated successfully",
            xpGained: gradeXpGained,
            student
        });

    } catch (error) {
        return res.status(500).json({
            message: "Internal server error"
        });
    }
};

