const router = require('express').Router();

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

var mysql = require('mysql');
const { get } = require('http');
const { resolve } = require('path');
var url = require( "url" );
var queryString = require( "querystring" );

var tempValue;

app.get('/', (req, res) => {
    
});

app.post('/', (req, res) => {

});

app.post('/user/login', (req, res) => {
    const con = mysql.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"st"
    });
    con.query(
    "select if(\"" +
    req.body.pass +
    "\" in (select password from users where \"" +
    req.body.login + 
    "\" in(select login from users)),1,0) as Pass;",
    (err, result, fields) => {
        res.send(""+result[0].Pass)
    })
    con.end();
});

app.get('/test/pass', (req, res) => {
    const con = mysql.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"st"
    });
    //con.query("select if("+req.body.pass+" in (select password from users where " +req.body.login+ " in(select login from users)),1,0);",(err, result, fields) => {})

    con.end();
});

app.get('/get/music', (req, res) => {
    const con = mysql.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"st"
    });
    var musicList=[];
    var musicVotes=[];

    let songsAmount=0;
    let votesAmount=0;

    con.query("select count(votes) mx, sum(votes) sm from st",(err, result, fields) => {songsAmount = result[0].mx; votesAmount=result[0].sm})
    
    con.query("select music,votes from st", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<songsAmount; i++){
            musicList.push(result[i].music)
            musicVotes.push(result[i].votes)
        }
        res.send([musicList,musicVotes,songsAmount,votesAmount]);
    });
    con.end();
});

app.get('/get/sched', (req, res) => {
    res.send("1")
});

app.get('/get/schedule', (req, res) => {
    const con = mysql.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"st"
    });
    var schedule=[],schnum=0,response="";

    con.query("select max(id) id from schedul",(err, result, fields) => {schnum=result[0].id})
    con.query("select timebegin from schedul", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<schnum; i++) schedule.push("\""+result[i].timebegin+"\"")

        response = ("{ \"time\": ["+schedule+"],")+ "\"size\": \""+schnum+"\"}";
        res.send(response)
    });

    con.end();
});

function setValue(value){
    tempValue=value;
}

app.get('/get/winner',async(req, res) => {
    const con = mysql.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"st"
    });
    var schedule=[],winners=0,response;

    var h = await new Promise((resolve) => {
        con.query("select count(id) num from st where votes=(select max(votes) from st)",(err, result, fields) => {
            winners=parseInt(result[0].num,10);
            resolve(res);
        })
    })
    h= await new Promise((resolve) => {
        con.query("select id from st where votes=(select max(votes) from st)",(err, result, fields) => {
            if(winners>1)response = result[Math.floor(Math.random()*100)%winners].id
            else if(winners===1)response = result[0].id
            res.send("{\"win\": \""+response+"\"}")
            resolve(res)
        }) 
    })
    con.query("update st set votes=0 where votes!=0")

    con.end();
});

app.post('/set/votes',async (request,response)=>{
    const con = mysql.createConnection({
        host: 'localhost',
        port: "3306",
        user: "root",
        password: "0000",  
        database:"st"
    });
    queryString ="update st set votes=? where id = ?"
    con.query(queryString,[request.body.h,request.body.num+1])
    
    
    var musicList=[];
    var musicVotes=[];

    let songsAmount=0
    let votesAmount=0

    con.query("select count(votes) mx, sum(votes) sm from st",(err, result, fields) => {songsAmount = result[0].mx; votesAmount=result[0].sm})
    
    con.query("select music,votes from st", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<songsAmount; i++){
            musicList.push(result[i].music)
            musicVotes.push(result[i].votes)
        }
        response.send([musicList,musicVotes,songsAmount,votesAmount]);
    });

    con.end()
});

app.listen(3005,'localhost')

