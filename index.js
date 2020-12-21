//Imports
require('dotenv').config();
const Discord = require('discord.js');
const bot = new Discord.Client();
const TOKEN = process.env.TOKEN;
const TRIGGER = '!';

//Global Vars
let finish_time = 0;
let timer_running = false;
let cancel = async () => {};
let connection;

function msToTime(duration) { //Modified from: https://stackoverflow.com/questions/19700283/how-to-convert-time-milliseconds-to-hours-min-sec-format-in-javascript
    let seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

    let plural_hours = (hours > 1) ? 'are ' : 'is ';
    let plural_mins = (minutes > 1) ? 'are ' : 'is ';
    
    return `${(hours !== 0) ? plural_hours + hours + ' hour' + ((hours > 1) ? 's' : '') + ', ' : ''}${(minutes !== 0) ? plural_mins+ minutes + ' minute' + ((minutes > 1) ? 's' : '') + ' and' : ''} ${seconds} seconds`;
}

async function delete_message(message) {
    await message.delete({
        timeout: 1e4,
        reason: 'Keeping the chat clean.'
    });
};

async function channel_timer(voice_channel_id, message) {
    timer_running = true;
    const channel = bot.channels.cache.get(voice_channel_id);
    if (!channel) throw new Error("Unable to find channel.");
    if (!connection) connection = await channel.join(); //If we haven't joined previously, reconnect.

    //Create the notification bell timer.
    let notif_timeout = setTimeout(() => {
        message.channel.send("One minute left!");
        let dispatcher = connection.play("./notification.mp3");
        dispatcher.on('error', e => {
            console.error(`A problem occcured! ${e}`);
        });
    }, finish_time - Date.now() - 6e4);

    //When the time runs out, disconnect everyone.
    let finish_timeout = setTimeout(() => {
        channel.members.forEach(member => {
            member.voice.kick();
        });
        channel.leave();
        message.channel.send("Call finished. :)");
        timer_running = false;
        connection = null;
        finish_time = 0;
    }, finish_time - Date.now());

    //Create the cancel function in case a user needs to cancel the timer.
    cancel = async (disconnect) => {
        console.log("Cancel called!");
        clearTimeout(notif_timeout);
        clearTimeout(finish_timeout);
        if (disconnect) {
            channel.leave();
            connection = null;
            finish_time = 0;
            timer_running = false;
        }
    }
}
bot.on('message', async message => {
    if (message.author.bot) return; //Don't respond to bots.
    if (message.content[0] !== TRIGGER) return;
    let args = message.content.toLowerCase().substring(TRIGGER.length).split(' ');
    switch (args[0]) {
        case 'ping': {
            await message.channel.send("Pong!").then(_ => delete_message(_));
            break;
        }
        case 'time': {
            //Check that user inlcuded num of minutes they want.
            if (!args[1]) { //If the user doesn't include the num of minutes, return.
                if (timer_running) message.channel.send(`There ${msToTime(finish_time - Date.now())} remaining until the end of the call.`);
                else message.channel.send("No time provided in your command.").then(_ => delete_message(_));
                break;
            }
            //Check that the num of minutes included was a number.
            args[1] = Number(args[1]);
            if (args[1].isNan) {
                message.channel.send("Unable to parse number of minutes as integer.").then(_ => delete_message(_));
                break;
            }
            const time_ms = Math.ceil(args[1]) * 6e4; //Convert the time in minutes to ms.

            if (args[1] === 0) {
                message.channel.send("Cannot start a 0 minute timer!").then(_ => delete_message(_));
                break;
            }

            //Check that the triggering user is in a voice channel.
            const voice_channel = message.member.voice.channel;
            if (!voice_channel) {
                message.channel.send("You must be connected to a voice channel to set a timer!").then(_ => delete_message(_));
                break;
            }

            if (!timer_running) {
                //Timer not running, so lets start it.
                finish_time = Date.now() + time_ms; //Set the finish time.
                channel_timer(voice_channel.id, message).catch(err => {
                    message.channel.send("An error occured trying to time the call! See the console for more info.");
                    console.error(err);
                });
                message.channel.send(`Call timer set at ${args[1]} minutes!`);
            } else {
                //Timer is running, so add the time to it.
                finish_time += time_ms;
                cancel(false);
                channel_timer(voice_channel.id, message).catch(err => {
                    message.channel.send("An error occured trying to time the call! See the console for more info.");
                    console.error(err);
                });
                message.channel.send(`Added ${args[1]} minutes to the timer!`);
            }
            break;
        }
        case 'cancel': {
            if (timer_running) {
                cancel(true);
                message.channel.send("Timer terminated.");
            } else message.channel.send("No timer available to terminate.").then(_ => delete_message(_));
            break;
        }
        case 'help': {
            message.channel.send(`
Use \`${TRIGGER}ping\` to check the bot is alive.
Use \`${TRIGGER}time <minutes>\` to start a timer.
Use \`${TRIGGER}time <minutes>\` while a timer is running to add additional time.
Use \`${TRIGGER}time\` while a timer is running to check the remaining time.
Use \`${TRIGGER}cancel\` to stop a timer.
Use \`${TRIGGER}destroy\` to kill the bot. (Warning! This may cause problems with active timers).
            `);
            break;
        }
        case 'destroy': {
            await message.channel.send('Attempting to restart.');
            console.info("Bot instructed to destroy through command.");
            bot.destroy();
            process.exit(0);
        }
        default: {
            message.channel.send("Unknown command!").then(_ => delete_message(_));
        }
    }
    
    // delete_message(message); //Deleting the trigger message.
});

bot.on('ready', () => {
    console.info(`Logged in as ${bot.user.tag}!`);
    bot.user.setActivity(`${TRIGGER}help`); 
});

bot.on('reconnecting', () => {
    console.info(`Reconnecting!`);
});

bot.on('disconnect', () => {
    console.info(`Disconnected!`);
});

bot.login(TOKEN);