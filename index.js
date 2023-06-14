const express = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
const stripe = require("stripe")('sk_test_51NEr7SA8JnQBN0GYbSzWwXzyIXCNjEhBKl83Pg6d9gSLXopFJ2lBwe3zss7x8fPcFwfFl6xvbsySlqXej9JUv3Rp0096Ia2VyH');
require('dotenv').config()
const port = process.env.PORT || 5000;

// middleware 
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dgqtjig.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: "unauthorized access" })
    }
    const token = authorization.split(" ")[1]
    jwt.verify(token, process.env.VITE_access_secret, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: "unauthorized access" })
        }
        req.decoded = decoded
        next()
    })
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const selectCoursesCollection = client.db("summer-camp").collection("selectCourses");
        const coursesCollection = client.db("summer-camp").collection("courses");
        const instructorsCollection = client.db("summer-camp").collection("instructors");
        const paymentsCollection = client.db("summer-camp").collection("payments");
        const paymentsHistoryCollection = client.db("summer-camp").collection("paymentsHistory");
        const usersCollection = client.db("summer-camp").collection("users");

        // jwt
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.VITE_access_secret, { expiresIn: "1h" })
            res.send({ token })
        })

        // create payment intent 
        app.post('/create-payment-intent', async (req, res) => {
            try {
                const { price } = req.body || {}
                const amount = Math.round(price * 100);
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: 'usd',
                    payment_method_types: [
                        "card"
                    ]
                })
                res.send({
                    clientSecret: paymentIntent.client_secret,
                })
            }
            catch (error) {
                res.send({ error: error.message })
            }
        })

        // users apis
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.get('/user/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== "User") {
                return res.send({ isStudent: false })
            }
            res.send(user)
        })
        app.get('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== "Admin") {
                return res.send({ isAdmin: false })
            }
            res.send(user)
        })

        app.get('/user/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== "Instructor") {
                return res.send({ isInstructor: false })
            }
            res.send(user)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.patch("/users/:id", async (req, res) => {
            const role = req.body
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            if (role.role === "make admin") {
                const updateDoc = {
                    $set: {
                        role: "Admin"
                    },
                };
                const result = await usersCollection.updateOne(query, updateDoc)
                res.send(result)
                return
            }
            else {
                const updateDoc = {
                    $set: {
                        role: "Instructor"
                    },
                };
                const result = await usersCollection.updateOne(query, updateDoc)
                res.send(result)
            }

        })

        // instructors api 
        app.get('/instructors', async (req, res) => {
            const result = await instructorsCollection.find().toArray()
            res.send(result)
        })

        // payment api


        // this data for enrolled students
        // app.get('/payments', async (req, res) => {
        //     let finalData = [];
        //     const paymentData = await paymentsCollection.find().toArray();
        //     paymentData.map(data => {
        //         finalData = [...finalData, ...data.selected_courses_id];
        //     });

        //     const courseData = await coursesCollection.find({
        //         _id: {
        //             $in: new ObjectId(finalData[0])
        //         }
        //     }).toArray();

        //     res.send(finalData);
        // });


        app.post('/payments', async (req, res) => {
            const selectedId = req.body
            const result = await paymentsCollection.insertOne(selectedId)
            res.send(result)
        })

        app.get('/paymentsHistory', async (req, res) => {
            const result = await paymentsHistoryCollection.find().toArray();
            result.sort((a, b) => new Date(b.date) - new Date(a.date));
            res.send(result);
        });

        app.post("/paymentsHistory", async (req, res) => {
            const paymentHistory = req.body;
            const insertResult = await paymentsHistoryCollection.insertOne(paymentHistory);
            const query = { course_id: { $in: paymentHistory.selected_courses_id.map(id => id) } }
            const deletedResult = await selectCoursesCollection.deleteMany(query)

            await paymentHistory.selected_courses_id.map(async (singleId) => {
                const { available_seats, enrolled_students } = await coursesCollection.findOne({ _id: new ObjectId(singleId) })
                const updateDoc = {
                    $set: {
                        available_seats: available_seats - 1,
                        enrolled_students: enrolled_students + 1
                    },
                };
                const newData = await coursesCollection.updateOne({ _id: new ObjectId(singleId) }, updateDoc)
            })
            res.send({ insertResult, deletedResult })
        })

        app.post("/payments", async (req, res) => {
            try {
                const payment = req.body;
                const insertResult = await paymentsHistoryCollection.insertOne(payment);
                const query = { _id: { $in: payment.selected_courses_id.map(id => new ObjectId(id)) } }
                const deletedResult = await selectCoursesCollection.deleteMany(query)

                const updateOperations = payment.courses_id.map(async (singleId) => {
                    const { available_seat } = await coursesCollection.findOne({ course_id: singleId })
                    const updateDoc = {
                        $set: {
                            available_seat: available_seat - 1
                        },
                    };
                    return coursesCollection.updateOne({ course_id: singleId }, updateDoc);
                });

                await Promise.all(updateOperations);

                res.send({ insertResult, deletedResult });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        // courses api     
        app.get('/courses', async (req, res) => {
            const { email } = req.query;
            if (email) {
                const query = { instructor_email: email }
                const result = await coursesCollection.find(query).toArray()
                res.send(result)
                return
            }
            const result = await coursesCollection.find().sort({ enrolled_students: -1 }).toArray()
            res.send(result)
        })

        app.get('/course/:status', async (req, res) => {
            const status = req.params.status;
            const query = { status: status }
            const result = await coursesCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/courses', async (req, res) => {
            const course = req.body;
            const result = await coursesCollection.insertOne(course)
            res.send(result)
        })

        app.patch("/courses/:id", async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: "approved"
                },
            };
            const result = await coursesCollection.updateOne(query, updateDoc);
            res.send(result)

        })

        app.delete("/courses/:id", async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await coursesCollection.deleteOne(query);
            res.send(result)

        })

        // select course api
        app.get('/selectCourses', async (req, res) => {
            const result = await selectCoursesCollection.find().toArray()
            res.send(result)
        })

        app.post("/selectCourses", async (req, res) => {
            const course = req.body;
            const result = await selectCoursesCollection.insertOne(course)

            res.send(result)
        })

        app.delete("/selectCourses/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await selectCoursesCollection.deleteOne(query)

            res.send(result)

        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('app is runnig...')
})

app.listen(port, () => {
    console.log(`app is running on port ${port}`);
})