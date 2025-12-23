import mongoose from "mongoose"

export const connectionDb=async()=>{
    try {
   const  conn=  await   mongoose.connect(process.env.MONGODB_URI)
   console.log("connection hostName",conn.connection.host)
    } catch (error) {
        console.log(error.message);
        process.exit(-1);
    }
}