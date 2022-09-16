const { ApolloServer, gql } = require('apollo-server');
const { MongoClient,  ObjectId } = require('mongodb');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
dotenv.config();

const { DB_URI, DB_NAME, JWT_SECRET } = process.env;

const getToken = (user) => jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30 days' });

const getUserFromToken = async (token, db) => {
  if(!token) {
    return null
  } 


  let tokenData = jwt.verify(token, JWT_SECRET) 
  if(!tokenData.id) {
    return null;
  } 

return await db.collection("Users").findOne({_id: ObjectId(tokenData.id)})
}

const typeDefs = gql`
  type Query {
    myTaskLists: [TaskList!]!
    getTaskList(id: ID!): TaskList
  }

  type Mutation {
    signUp(input: SignUpInput!): AuthUser!
    signIn(input: SignInInput!): AuthUser!
    createTaskList(input: createTaskListInput!): TaskList!
    updateTaskList(id: ID!, title: String!): TaskList!
   deleteTaskList(id: ID!): Boolean!
   addUserToTaskList(taskListId: ID!, userId: ID!): TaskList!
  
  }

  

  input createTaskListInput{
  title: String!
  }

  input SignUpInput {
    email: String!
    password: String!
    name: String!
    avatar: String
  }

  input SignInInput {
    email: String!
    password: String!
  }

  type AuthUser {
    user: User!
    token: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    avatar: String
  }

  type TaskList {
    id: ID!
    createdAt: String!
    title: String!
    progress: Float!
    users: [User!]!
  }
 

 
`;

const resolvers = {
  Query: {
  myTaskLists: async(_, __, {db, user}) => {
   if(!user) {
    throw new Error("to get a taskList you need to bet auntenticated")
   } 

   return await db.collection("TaskList").find({userIds: user._id}).toArray()
  }
, 
  getTaskList: async(_, {id}, {db, user}) => { 
    if(!user) {
      throw new Error("to get by id you need to be auntenticated")
    }

    return await db.collection("TaskList").findOne({_id: ObjectId(id)}) 
    
  }

  
  
  },
  Mutation: {
    signUp: async (_, { input }, { db }) => {
      const hashedPassword = bcrypt.hashSync(input.password);
      const newUser = {
        ...input,
        password: hashedPassword,
      }
      // save to database
      const result = await db.collection('Users').insertOne(newUser);
      const user = await db.collection("Users").findOne({email: input.email})
      return {
        user,
        token: getToken(user),
      }
    },

    signIn: async (_, { input }, { db }) => {
      const user = await db.collection('Users').findOne({ email: input.email });
      const isPasswordCorrect = user && bcrypt.compareSync(input.password, user.password);

      if (!user || !isPasswordCorrect) {
        throw new Error('Invalid credentials!');
      }

      return {
        user,
        token: getToken(user),
      }
    },

    createTaskList: async(_, { input }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }

      const newTaskList = {
        ...input,
        createdAt: new Date().toISOString(),
        userIds: [user._id]
      }
       await db.collection('TaskList').insertOne(newTaskList);
      return await db.collection("TaskList").findOne({title: input.title})
    },

    updateTaskList: async(_, {id, title}, {db, user}) => {
    if(!user) {
      throw new Error("to update a task you need to be auntenticated")
    }

     await db.collection("TaskList").updateOne({_id: ObjectId(id)}, {$set: {title}}) 
     return await db.collection("TaskList").findOne({_id: ObjectId(id)})
    },

    deleteTaskList: async(_, {id}, {db, user}) => {
    if(!user) {
      throw new Error("to delete a task you need to be auntenticated")
    } 

    await db.collection("TaskList").deleteOne({_id: ObjectId(id)}) 
    return true
    },

    addUserToTaskList: async(_, { taskListId, userId }, { db, user }) => {
      if (!user) { throw new Error('Authentication Error. Please sign in'); }

      const taskList = await db.collection('TaskList').findOne({ _id: ObjectId(taskListId) });
      if (!taskList) {
        return null;
      }
      if (taskList.userIds.find((dbId) => dbId.toString() === userId.toString())) {
        return taskList;
      }
      await db.collection('TaskList')
              .updateOne({
                _id: ObjectId(taskListId)
              }, {
                $push: {
                  userIds: ObjectId(userId),
                }
              })
      taskList.userIds.push(ObjectId(userId))
      return taskList;
    },

    

   
  },

  User: {
      id: ({ _id, id }) => _id || id,
  },

  TaskList : {
    id: ({ _id, id }) => _id || id, 
    progress: () => 0, 
   users: async({userIds}, _, {db}) => Promise.all(
    userIds.map((userId) => (
      db.collection("Users").findOne({_id: userId})
    ))
   )
  }, 

  

 
};

const start = async () => {
  const client = new MongoClient(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const db = client.db(DB_NAME);

  // The ApolloServer constructor requires two parameters: your schema
  // definition and your set of resolvers.
  const server = new ApolloServer({ 
    typeDefs, 
    resolvers, 
    context: async ({ req }) => {
      const user = await getUserFromToken(req.headers.authorization, db);
      return {
        db,
        user,
      }
    },
  
  });

  // The `listen` method launches a web server.
  server.listen().then(({ url }) => {
    console.log(`🚀  Server ready at ${url}`);
  });
}

start();


  
