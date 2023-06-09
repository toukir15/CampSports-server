const express = require('express')
const app = express()
const cors = require('cors');
// const jwt = require('jsonwebtoken');
const stripe = require("stripe")('sk_test_51NEr7SA8JnQBN0GYbSzWwXzyIXCNjEhBKl83Pg6d9gSLXopFJ2lBwe3zss7x8fPcFwfFl6xvbsySlqXej9JUv3Rp0096Ia2VyH');
require('dotenv').config()
const port = process.env.PORT || 5000;

// middleware 
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = "mongodb+srv://summer-camp:admin123@cluster0.dgqtjig.mongodb.net/?retryWrites=true&w=majority";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const selectCoursesCollection = client.db("summer-camp").collection("selectCourses");
        const coursesCollection = client.db("summer-camp").collection("courses");
        const paymentsCollection = client.db("summer-camp").collection("payments");
        const usersCollection = client.db("summer-camp").collection("users");

        // create payment intent 
        app.post('/create-payment-intent', async (req, res) => {
            try {
                const { price } = req.body || {}
                const amount = Math.round(price * 100);
                // console.log(price, amount);
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
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        // payment related api

        app.get('/payments', async (req, res) => {
            const result = await paymentsCollection.find().toArray()
            res.send(result)
        })

        app.post("/payments", async (req, res) => {
            const payment = req.body;
            console.log(payment.courses_id);
            const insertResult = await paymentsCollection.insertOne(payment);
            const query = { _id: { $in: payment.selected_courses_id.map(id => new ObjectId(id)) } }
            const deletedResult = await selectCoursesCollection.deleteMany(query)


            await payment.courses_id.map(async (singleId) => {
                const { available_seat } = await coursesCollection.findOne({ course_id: singleId })
                const updateDoc = {
                    $set: {
                        available_seat: available_seat - 1
                    },
                };
                const newData = await coursesCollection.updateOne({ course_id: singleId }, updateDoc)
                console.log(newData);
            })



            res.send({ insertResult, deletedResult })
        })

        // courses api 
        app.get('/courses', async (req, res) => {
            const result = await coursesCollection.find().toArray()
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
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            // console.log(query);
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