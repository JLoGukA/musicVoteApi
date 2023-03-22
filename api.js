const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const fs =require('fs')
const formidable = require('formidable');
const axios=require('axios');
const { exec } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json());

const con = mysql.createConnection({
    host: 'localhost',
    port: "3306",
    user: "root",
    password: "0000",  
    database:"st"
});

var onUpload=""

async function checkOnline(){
    let queryIp=(await con.promise().query("select distinct id,ip from st.devices"))
    
    for(let i=0;i<queryIp[0].length;i++){
        let str=queryIp[0][i].ip
        await axios.get("http://"+str+":80/isAlive").then((res)=>{/*res.data should be "Alive"*/ }).catch((error)=>{
            con.query("delete from devices where id ="+queryIp[0][i].id,(err, result, fields) => {/*console.log(result)*/});
        })
    }
    
}
//setInterval(checkOnline,180000)
app.get('/', (req, res) => {
    res.sendStatus(200)
});

app.get('/file/generate',async(req, ress) => {
    
    let path = __dirname+"/genAudio"

    if(req.headers.file!==undefined){
        let decname = decodeURI(req.headers.file)
        let dectext = decodeURI(req.headers.text)
        exec("echo \""+dectext+"\" | RHVoice-test -o \"/$home/gen/"+decname+" -p aleksandr-hq",(error,stdout,stderr)=>{
            if(error)console.log(error)
            if(stderr)console.log(stderr)
        })
        
    }
//     Место файла конфига:
// sudo nano /usr/local/etc/RHVoice/RHVoice.conf

// Тест:
// echo "Привет!" | RHVoice-test -o "/mnt/c/Games/wav/1.wav" -p aleksandr-hq

    




    let files=fs.readdirSync(path)
    ress.send(files)
})

app.post('/file/upload',async(req, ress) => {
    let options={
        maxFileSize:20* 1024 * 1024 //20MB
    }
    const form = new formidable.IncomingForm(options);
    form.parse(req, async (err, fields, files) => {
        let raw = fs.readFileSync(files.file.filepath)  
        
        //fields.saveDir - directory to save on device      
        fs.writeFile("filesToUpload/"+fields.fileName, raw,(err)=>{
        })
        onUpload="filesToUpload\\"+fields.fileName
        let fileDir=fields.saveDir
        if(fileDir[0]!=='/')fileDir='/'+fileDir
        if(fileDir[fileDir.length-1]!=='/')fileDir+='/'
        let config = {
            headers: {
                'file': String(fileDir+fields.fileName),
                'dir':String(fileDir),
                'Content-Type': 'multipart/form-data'
            }
        }
        await axios.post("http://"+fields.ip+":80/upload",{raw},config).then((res)=>{/*console.log(res.statusText)*/}).catch((error)=>{
            console.log(error.cause)
        })
        await axios.get("http://"+fields.ip+":80/getResources").then((res)=>{
            ress.send(res.status)
        })
    });
})

app.get('/file/download',async(req, ress) => {
    const options={
        root:__dirname
    }
    if(req.headers===undefined)ress.sendStatus(404);

    if(req.headers.gen!==undefined){
        let decname =decodeURI(req.headers.filename)
        let path = "genAudio/"+decname
        ress.sendFile(path,options,(err)=>{
            if(err)console.log(err)
        })
    }
    else{
        let writer=fs.createWriteStream("filesToUpload/"+req.headers.filename,{highWaterMark: Math.pow(2,16)})
        writer.on('close',()=>{
            ress.sendFile("filesToUpload/"+req.headers.filename,options)
        })
        await axios({
            url:"http://"+req.headers.ip+":80/download",
            method:'GET',
            responseType:'stream',
            headers:{
                'file': req.headers.file,
            }
        }).then((res)=>{
            res.data.pipe(writer)
            
        }).catch((error)=>{console.log(error)})
    }

    
})

app.post('/file/delete',async(req, ress) => {

    
    if(req.headers.gen!==undefined){
        let decname = decodeURI(req.headers.filename)
        await fs.promises.unlink(__dirname+"/genAudio/"+decname)
        ress.send(200)
    }
    else{
        await axios({
            url:"http://"+req.headers.ip+":80/delete",
            method:'GET',
            headers:{
                'dir': req.headers.dir,
            }
        }).then((res)=>{
    
        }).catch((error)=>{console.log(error.cause)}).then(async()=>{
            await axios.get("http://"+req.headers.ip+":80/getResources").then((res)=>{
                ress.send(res.status)
            })
        })
    }

    
    
})


app.post('/device/sendInfo', (req, res) => {

    let array = Object.entries(req.body).map(([key,value])=>value);
    res.sendStatus(200);
    let ans;
    con.query(
    "select if(" +
    req.body.ID + 
    " in(select id from st.devices),1,0) as pass",(err, result, fields) => {
        
        if(result!=undefined&&result[0].pass)con.query("delete from st.devices where id="+req.body.ID);
        
        for(let i=0; i<array.length-2; i++){
            con.query("insert st.devices(id,ip,File) values(" +
                        req.body.ID +
                        ",\"" +
                        req.body.IP +
                        "\",\"" +
                        array[i] +
                        "\")"
                        ,(err, result, fields) => {})
        }
    }); 
    //отправить в отдельную таблицу ИД устройства
    
});

app.get('/device/info', async (req, res) => {
    
    var deviceInfo=[]
    var deviceFile=[]
    
    let ress = (await con.promise().query("select distinct id,ip,count(file) as cnt from st.devices group by id,ip").catch((err)=>{return}))
    let queryFile=(await con.promise().query("select file from st.devices").catch((err)=>{return}))
    
    for(let i in ress[0]){
        deviceInfo.push([ress[0][i].id,ress[0][i].ip,ress[0][i].cnt])
    }
    let k=0
    for(let i=0; i<deviceInfo.length;i++){
        deviceFile.push([])
        for(let j=0+k;j<deviceInfo[i][2]+k;j++){
            deviceFile[i].push(queryFile[0][j].file)
        }
        k+=deviceInfo[i][2]
    }

    res.send({deviceInfo,deviceFile})

});

app.post('/user/login', (req, res) => {

    con.query(
    "select if(\"" +
    req.body.pass +
    "\" in (select password from users where \"" +
    req.body.login + 
    "\" in(select login from users)),1,0) as Pass;",
    (err, result, fields) => {
        res.send(""+result[0].Pass)
    })

});

app.get('/get/music', (req, res) => {
    
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
});

app.get('/get/sched', (req, res) => {
    res.send("1")
});

app.get('/get/schedule', (req, res) => {
 
    var schedule=[],schnum=0,response="";

    con.query("select max(id) id from schedul",(err, result, fields) => {schnum=result[0].id})
    con.query("select timebegin from schedul", (err, result, fields) => {
        if(err)throw err;
        for(var i=0; i<schnum; i++) schedule.push("\""+result[i].timebegin+"\"")

        response = ("{ \"time\": ["+schedule+"],")+ "\"size\": \""+schnum+"\"}";
        res.send(response)
    });

});

app.get('/get/winner',async(req, res) => {

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


});

app.post('/set/votes',async (request,response)=>{

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

});

process.on('exit', function () {
    con.end();
});

app.listen(3005)

