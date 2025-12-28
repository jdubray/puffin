All right, I think we can start. So let people join.
0:07
Uh folks, thanks a lot for uh joining at another session at Applied A. I think
0:13
25th session or 26th session. Uh team, do you remember which session it is?
0:19
I started telling months my second. Yeah. Yeah. Yeah. I I think it's 25th or
0:25
26th like half a year which is uh which is a good feeling that uh we to
0:30
successfully do for uh so long. Uh for folks who are actually new over here a
0:36
little bit of an introduction. So Pravin and I run this uh cloud and it started as a way for us to uh you know exchange
0:45
ideas on how to learn AI among our friends and over a period of time you know a lot more folks actually joined
0:51
and uh yeah so now we run this club we there are like what thousand close
0:57
to,500 people uh in the club today and uh we've done about 26 successful
1:03
sessions. So a little bit about what we do over here. So there are a couple of uh major things uh that happen. So
1:09
number one is we do weekly sessions. So every Saturday at 10:00 a.m. this is 99%
1:16
of the times we have an expert coming in and taking a session on a topic related
1:22
to right. So this could be any uh topic since there is no structure to it. Uh so
1:29
when we find the expert and we find the topic actually relevant for audience we actually do that and the audience are
1:34
mostly folks who are operators who have you know several years of experience under their belt and uh we the objective
1:41
is that people should learn how to work with air at least understand what are these different AI concepts and how to
1:47
use them in their you know daily jobs that's kind of the objective. So all the past sessions are uh there in
1:54
YouTube they're available for free. So there are some amazing sessions over there. Just please have a look uh if you
1:59
are actually interested and that's the first thing that we do. Uh the second thing that uh uh we we have started
2:07
recently is uh we've started creating these study groups. So this is more involved just how in you know colleges
2:15
we have these study groups where people learn a concept together. So we've created this concept of study groups where people can come together and
2:21
starting working on it um sorry work on it uh work on a particular project. So
2:27
currently we are running n as a main thing but we will do more such stuff. So if you want to like uh do more around it
2:34
or if you want to join just go to update.cl club and join the clubs. We'll add it to the WhatsApp group and everything happens from there. Right. So
2:40
these are the major things that we actually uh do and apart from this we have WhatsApp group which is mainly
2:46
focused on helping people communicate and you know share ideas on an offline
2:51
basis right so all of these are free uh currently we don't make any money out of it uh so like use the resources and uh
3:00
if you think we can do something better just let us know okay awesome now uh on
3:06
to today's session so before I get into the session itself A few housekeeping rules. The session is going to be for an
3:12
hour. And uh and before I hand it over to Adita the if you have any questions
3:18
please post in the chat. Uh because we have a lot of folks here it will help for us to keep that organized over
3:23
there. Pravin or I will interrupt or Adita will pause in between so that you can ask these questions directly also.
3:29
Right. But use chat as the main mechanism for you to post questions. Now coming to uh today's session. So I'm
3:35
like super super excited to have uh you know Arita here taking these sessions. He's been a longtime member of a club.
3:43
We've known each other personally for for quite some time now but uh she's been one of the most active folks in the
3:49
aday community and anything with respect to using new or their performance or
3:55
with respect to prompts and especially I remember a few uh detailed documents he
4:01
has actually shared on how to write perfect prompts for you know different types of models etc. So I can't think of
4:06
anybody better to come and like teach us uh this aspect now a little bit about him. So he's he's a marketing expert. Uh
4:13
he's been in the marketing leadership for a while across companies like you know uh Jio or Stripe or White Hart
4:20
Junior and now what we do. And um yeah so hopefully like I'm very very excited
4:26
to kind of listen to what he has to say and hope you over to your
4:34
Hey thanks VA. Yeah, and I've been in the group for a while, but I think this is the first live session I'll attend in
4:40
its entirety. End up watching all of them after, but uh yeah, good to be here. Thanks for hyping this up. I am
4:47
hopeful I can match the hype. But yeah, very quickly about me. Uh like Bala
4:52
said, I've been in marketing and especially B2B SAS uh for quite a while. I really started diving into AI probably
4:58
about less than a year ago um when I quit my previous gig at image kit took a
5:04
sabbatical and I was like lord what is all this AI stuff about and uh I I've dabbled with NA10 and this and that uh
5:12
I've not written production grade code in 20 plus years uh though I'm trained as an engineer so I can write code I
5:18
can't write any of it uh so I obviously gravitated towards block engineering because I'm very lazy and I was like how
5:23
can I get the most out of the least typing that have to do uh GPT and claude and yeah that's how it
5:30
came about. I built my own uh custom GPD that takes my random scribblings and
5:35
demands and turns it into a proper uh prompt and uh yeah then once Bala
5:40
reached out I got a little deeper into it and uh yeah with that I'll uh start a
5:46
thing. So I'm going to do this uh a quick presentation. I have not made a
5:52
presentation like 10 years. Okay. So like forgive any formatting and uh
5:58
coloring errors but yeah I will run through this uh what I plan to do is kind of get into we'll start with okay
6:05
it should present right. Yeah. So I will run through like some
6:10
basics of prompting. Uh but then again we've had LLMs for quite a while. So I'm
6:16
assuming everyone's at least done a few prompts of their own and they know the basics of what works and what doesn't
6:21
work. Then what I'm really want excited to get into over the last month is uh and bring this here is kind of pull back
6:28
the curtain on how LMS really work. How they process your instructions, how they read it, how do they break down a task,
6:35
what tasks cost them more, what task cost them less, what does what do I even mean by cost? get into all that stuff
6:42
which kind of sets the meta on uh how LLM's process prompts right and that
6:48
just makes using all these tools and tips and techniques a lot easier if you understand the mechanics behind it. I
6:54
wanted to cover prompt engineering for like images and text to video and text to image but I haven't been able to get
7:00
into that. I'll show you guys what I built for work if we have time at the end. But I'll pretty much focus on core
7:06
prompt engineering itself. Right. Uh after this I'll share this deck as well as my larger notion uh
7:15
document as well which you can see which has like more or less the same but same more notes some prompts lots of links.
7:22
So I'll share this as well right after this uh talk. Cool. Let's get right into it
7:28
right prompting basics. So these are like universal best practices. You've
7:34
probably seen some of these uh floating around the internet. Uh and these are
7:40
like hygiene stuff which everyone uh should be doing, right? So use examples.
7:45
It's been shown again and again that LLM's respond to examples very well. Uh
7:50
and just putting a few shots of examples into your prompt is generally has
7:55
significantly better results than just ask giving it an instruction. And that's a loweffort way to just lift the level
8:01
of what we're doing, right? Uh and design for simplicity and unambiguity.
8:07
If your instruction is clear, output is clear. I mean that applies for humans, it applies to LLMs as well, right? If you're telling an intern or an agency
8:13
what to do, then the clearer you are and the more unambiguous what you want is the better for everyone. And the same
8:18
applies for LLMs. Uh this is a format which I've seen a lot and it seems to be fairly effective, which is the rice act
8:25
framework. Give LLMs a role. Now you've probably seen that right act as a managing consult management consultant
8:31
act as a copywriter act as a playwright. Uh what this does is it limits the scope
8:38
of all the information that an LLM will reference right because an LLM has
8:43
ingested in its training like so much data across Reddit and the internet and
8:50
books and all the books ever written. And so if you ask it to do something, which piece of relevant information
8:57
should it pull out from its entire training data is a big it's a big
9:02
question mark in itself, right? Or a big task in itself. So the moment you put a role, it does limit its uh focus to
9:09
that, right? And uh yeah, obviously if you have a task, say task like say this
9:14
is what I want you to do. Be very specific on that. Uh and like with humans, we are very good at inferring
9:20
what someone wants when they tell us something. Uh LLMs may not be so good at it. So easier to just say this is the
9:26
task for you, right? Context. Context is probably the big hot thing right now. Prompt engineer has
9:33
become context engineering. uh and I'll talk about this a little more on how to provide context effectively and don't
9:39
just dump like 500 words of stories and
9:44
uh background information into it like it can read all of that but the more you give it the harder it is for it to make
9:50
sense of everything. Examples as I mentioned is a big part of this. uh define the format output. If it knows
9:56
that I want a pres a code snippet or I want a LinkedIn post or I want a blog or I want uh a strategy document with 15
10:04
bullet points, it just it's able to work backwards a lot better when it knows that, right? Uh
10:12
also the larger goal on what you're trying to achieve is pretty important and I'll get into this as well. This is
10:17
really important when you're breaking down a complex task into multiple prompts, right? and uh set the tone
10:23
because it can write whatever the hell it wants and then you have to refine refine refine. Uh so setting the tone
10:28
and the style if you want to output is also a pretty good one. Uh you have to give LLMs two things instructions you
10:35
have to give them constraints but you need both and generally instructions work better telling them what to do is
10:42
more helpful than telling them what not to do but uh yeah you can't do without either of them. output length just like
10:48
output format helps uh JSON as a format is great from forcing
10:55
extreme structure. So if you want uh something that needs to be ingested into NA10 or uh used in any programmatic
11:02
nature JSON is a great way uh to this. I've used JSON for inputs. This is also pretty awesome. If we get time I'll
11:08
cover this a bit uh especially for uh text to image. Yeah, but these are like
11:14
very simple uh starting warm-up
11:19
practices for prompts, right? And uh yeah, what I'm not going to get into is
11:25
all these prompting techniques, right? I pulled this from a white paper. There's something like 60 something different
11:31
prompting techniques. You've probably heard of some of these like oneshot, multi-shot, chain of thought, tree of
11:36
thought, yada yada blah blah. There's so many of them, right? like uh a lot of these were kind of built in the early
11:43
days of GPTs like GPT3 when the LLMs were compared to now quite dumb and you
11:49
had to apply these on a pretty much everyday basis to get decent output but like now they've also become smarter
11:56
right the the models have gotten more robust they're better at understanding what we want they're better at inferring
12:02
what we want from a basic problem so don't have to use this all the time but it's it's good to know about right uh
12:08
but at the same time knowing these techniques without knowing how they influence an LM is a lot like learning
12:13
your multiplication tables without knowing how to multiply right it's one
12:18
thing to know 9 into 9 is 81 but how did you get them is what I kind of will focus my uh next 45 minutes on right so
12:28
yeah that said I'm going to uh contradict myself and get into a few of these which have uh which you'll hear a
12:36
lot uh in conversations And uh they're actually a lot simpler than they sound, right? A lot of these are come out of
12:42
academic papers which sound more complicated than they deser need to be. But yeah, no is just a general
12:48
instruction. I put an example prompt here as well that you know just give me three ways to improve time management at
12:54
work. Multi-shot is where you give multiple examples of what you want your output to look like and then ask the
13:02
question. So then it knows okay this is what I'm expected to provide as an output as a sample and uh hence I will
13:08
provide my output accordingly. Chain of thought is when you have a complex uh
13:15
question and you want to kind of force the model to think step by step because
13:21
the way models work is that they will ingest your entire question and then try and figure it out. But you force them to
13:28
think step by step they will take okay let me do part one then do part two part three and sometimes if it's complex you
13:33
can tell them also like in this case right first identify time wasting habits then maximum solutions then prioritize
13:40
uh this will generally get you better results than just saying give me three ways to improve time management at work
13:46
right and you can combine these two you can combine mult
13:51
give it a couple of examples and tell it to think step by step and work it out so obviously all of these build on each
13:57
other and you get better and better uh outputs out of it. But that's basically what they are for all their complicated
14:02
language around multi-shot coot. It's basically tell it to think step by step and give it a few examples and it does
14:08
better than just being given a demand, right? Uh other things I particularly
14:13
like this one metaring which is tell it what the structure of your output needs to look like. This is great in cases
14:20
where you can't really give it a clear example but you can tell it this is what I want my output to look like, right? Uh
14:26
so give it a structure, give it like say I want a strategy document with a executive summary, 15 bullet points and
14:33
a final strategic recommendation. That's a great meta prompt which you lead off with before you make the ask. So already
14:40
kind of structured this thinking saying this is what I have to uh fill in the blanks with right this of course we all
14:47
done in some uh informal way or the other like chaining prompts. do this
14:53
step, give me the output, let me see that, then do the next step, then do the next step, and then you build one on top
14:59
of another. Right? So, this obviously prompt chaining gets can get very sophisticated and uh but it's uh also
15:06
something we've used fairly often, right? Uh I'll come back to tree of thought because programm is a lot
15:12
easier. I'm sure you've seen a lot of these memes and things on LinkedIn and Twitter of how LLMs can't count how many
15:19
hours are there in Strawberry or it cannot count how many days are there since my last birthday and stuff like
15:24
that because that's just not how it's entire programming and computation work. Some things are just done a lot better
15:30
with the code snippet. So, making it write a program and then passing what
15:36
you want as variables into that program can often be very useful. I've used this quite a few times when I wanted to
15:43
calculate days. So if I'm trying to calculate like okay I need to know how many days are left in the year. Today
15:49
we're on August 16th. Uh it's more effective if I say write a code snippet
15:54
calculating the number of days given uh an input date from the end of the year
16:00
and then I just give August 16 input date and it calculates it and it uses a code snippet rather than trying to
16:05
figure it out for itself. And yeah tree of thought is interesting. I came across this only last week, so I haven't tried
16:11
this out myself, but it's generally like when you need an output and there are
16:17
multiple ways that you could get at it and you're not sure which is the route to take. So then you say okay try out
16:23
multiple routes and give me whichever gives you the best answer.
16:29
Right? So for example, here it's the three lines of reasoning how to improve time at work. Evaluate them for
16:35
feasibility and impact and choose the three most pro promising. So it's trying different ways to come up to solve for
16:40
this idea of improving time management at work. But it really helps if you have a way to score the final outputs and say
16:47
okay you followed three different paths and I've got output one output two output three which one's the best. Now
16:53
you need a way to score for the which one's the best. Uh we'll come back to this towards the end. Yeah
16:58
cool. I will pause here. This is just the fundamentals which is why I kind of went through it a little fast. But uh
17:05
any questions and thing before I get into the real interesting stuff?
17:14
Uh there are no questions right now folks. Does anyone have any questions?
17:20
Uh I have a I have a few regarding reliability but I think we'll handle that towards the end. Mhm. Sure.
17:26
Yeah. PP will be shared guys. Yeah, cool. Uh, did this go to full screen?
17:33
No. Okay. Yeah. So, how do LMS really work, right? Um we've all seen this marketing like
17:41
all over in whether it's Elon or Sam Alman which is like Chad GPD is a really
17:46
smart intern and Jenzi and millennials use it like a life adviser and it's smart and Grock is smarter than a PhD in
17:53
everything and uh you have to be truly intelligent to be good at language otherwise you're not really intelligent
17:59
and charged is good at language so it's intelligent right uh we've heard all these quotes and a lot of this is hype
18:06
and the agenda behind a thought of this is very intentional is to frame LLMs in
18:12
as human like and approachable a manner for the general public.
18:18
So like our parents or people who are not technically savvy and a little intimidated by this super intelligent
18:24
chatbot. It's a lot of this marketing is to make it relatable. But this is also I
18:30
realize for myself personally causing a bit of a problem because I'm taking them literally and think okay I'm talking to
18:35
a person and it it's exacerbated by the fact that the way these LLMs talk also right they have this engineered human
18:42
persona to make you feel comfortable talking to them they don't feel machine-like at all but here's the
18:48
reality u forget grock right grock gave me like nonsense very irritating uh
18:53
chatbot but I asked chat GPT to define itself as slot to define itself and uh
19:00
yeah I've highlighted the main words here right it's predicts human lang predicts and generates human language
19:06
it's learning stat statistical patterns in how words and concepts relate they
19:11
are not human they're not even human like they're just statistical language prediction engines they're literally
19:16
programs and it's something I've realized for myself I have to keep keeping in mind because they try to be
19:22
so relatable and friendly that you're talking to a program And
19:28
that's my first goal with prompt engineering is you're talking to a program which means you're not speaking to a human like AI. It's not true AI. Uh
19:36
so there is prompt engineering or writing prompts is closer to programming than English. That's the first goal that
19:43
I'll set here for us. The second thing is that LLMs are probabilistic. They're
19:49
not deterministic. They are guessing at what is the most likely answer. Right? Deterministic is where you can clearly
19:56
say without doubt given X output is Y. But probabilistic is given X output is
20:02
most likely Y could also be Z but there's a very small non-zero chance of being Q. So let me say why
20:10
but that doesn't mean it is absolutely without any shred of doubt why that's how LLMs think and that's how they
20:17
operate and when they give you an answer they are going with a probabilistic uh
20:22
piece. So if you ask an LLM the sky is blank,
20:28
it will probabilistically say the most likely answer is blue. So it'll answer blue. But it's also generated the sky is
20:34
blue, the sky is cloudy, the sky is rainy, the sky is dusty, the sky is orange, the sky has a sunset, the the
20:41
sky is dark, the sky is there's so many options, right? The sky is black, but it'll go with blue because that's the
20:49
most likely answer that you you want. It's guessing what you want, right? It's the ultimate sick of hand and ultimate
20:55
jump in that sense, right? So what's our goal then when we write uh prompts is to
21:01
maxim we want deterministic answers. We want a definite answer. We don't want guesses. So then the goal of prompt
21:09
engineering is to bring force the LLM to be as deterministic as possible. If you
21:15
want Y, maximize the probability that it'll reach Y. Minimize the probability of everything else. If you want Z, then
21:22
maximize the probability you'll get Z. And how do you do that is really just constraints and making sure that it's
21:27
not guessing and making up its own ideas and making up its own assumptions.
21:33
This is a lovely one. Uh how do LLM brains work? LLMs read a task. They
21:39
understand a task. They break it down into subtask. They execute subtask. They collate subtask into a final output. And
21:47
how do human brains work? the exams exact same way. But we humans don't have
21:54
fancy observability tools, processor logs, GPU flop logs, none of
22:00
that. So we cannot we come up with an idea and we can't back trace how we got there. We can't say that I thought of
22:07
this then I thought of that and I connected X with Y and that's how I got there. So then we say oh creativity,
22:12
inspiration, intuition. But at the back end what's really happening even in our brains is a very similar way to LLM's
22:18
work. But we just can't track it. And then what happens is that we don't think
22:24
in those steps. We don't look at a task and really think in so rigorously and these are all the steps that you need to
22:31
go into. We just say I want this done right which mirrors the way we think our brains work.
22:37
But that's not how we want. We should be prompting because LLMs are extremely sequential
22:43
and extremely like specific on that. So we need to prompt from a way that they would work which is very task based,
22:49
very subtask based, very break it down model, not driven by inspiration and
22:55
creativity as much as they want to package themselves doing that. Right?
23:01
So yeah, prompting is be structured like a program. Maximize for
23:07
a forcing a deterministic answer, apply constraints and lean into the way they
23:12
operate, right? Understand how they work under the hood and build your prompter around that. For me, prompting is natural language SQL. That's it. There's
23:19
that's the uh big aha moment I've had over the last month or so, diving deeper
23:25
and deeper into how prompts work.
23:31
Cool. Let's look at some bad props, right? Uh, we've all written prompts like this. Is
23:37
pineapple on pizza a good idea? No, it's not a good idea on pizza. But why is this prompt a bad one? Because we have
23:44
everything is vague here. What is good? Whose definition of good? Your definition, GPT's definition, Reddit's
23:51
definition, New York Times definition, Mich? What about should it answer from the
23:57
perspective of Indians, Americans, Brits, South Africans? Like in what perspective?
24:03
Everything is open-ended here, right? This is a deadly one. We've all written prompts like this. Plan a 7-day AI
24:09
workshop for college students. This is the number of questions it's going to spot that are not answered and
24:16
it's going to guess and assume for itself. Right? This is just on workshop design. Then there's another on
24:22
objectives because you set objectives. Another bunch on schedule because you asked for schedules, you asked for
24:29
resources. So all that and these are just interconnected and
24:34
all these are relevant questions to be asking. And if you asked a employee in your company to do this, they would ask
24:40
these questions. They would have these questions. They may not ask them, but uh they would have these questions, right?
24:46
The human has the like intuitive ability to judge what
24:52
questions to answer for themselves and what to come back to you and ask. LLMs
24:58
will rarely do that. They'll just guess everything because they've been told to do it and they will do it.
25:04
Right? Here again, build a snake game, make it look nice. What does look nice even mean?
25:09
Right? And obviously you're asking for an app. So there are like thousands of questions as to answer on and it'll just
25:15
guess it right and this is exactly the kind this is exactly the prompt that they gave it that the GPT team
25:21
themselves gave it at the live cast of GPT5 and I was like is that prompt that you're going to give it make it look
25:26
nice I was laughing when I saw that and then no that's not how you prompt and I
25:32
yes they're trying to show that even if you give something so basic as that it can still build something but that's not
25:38
how ideally you should be prompting right I this is one of my own prompts and after I wrote it and I saw the
25:44
output I realized just how stupid I was doing which is write a viral LinkedIn post on B2B SAS in the tone of Morpheus
25:51
from the matrix and I'm basically asking it to do B2B SAS research come up with a
25:58
point of view write it LinkedIn style push that LinkedIn style to the limit
26:03
for virality and then layer morphes from the matrix on top of that all at once like it's difficult enough for people to
26:11
do it, let alone a program to do that. Right? So, these things are generally just asking either too much in one shot
26:18
or leaving way too many things unanswered for uh the GP2 or cloud to
26:25
understand what you want exactly. Right? That said, look at this prompt. You
26:31
probably have seen these kind of prompts floating around on social and other
26:36
places. Yeah. So this looks like a good product,
26:43
right? Well, actually not because the positives are good. It has a clear goal.
26:49
It has a clear constraint on formats. Uh it has a this part is pretty good. This
26:57
part is a disaster the context because it has a relationship dynamics. How is that relevant to the task? It has
27:02
emotional state. Again, how is that relevant to the task? And then there are a bunch of other requirements which are
27:08
just slammed into this wall of text for the LLM to figure it out and pick it out among all this right hiking history
27:15
recent experience with Mount Tam temporal constraints that it should be within the next couple of weekends. Uh
27:22
food preferences that it has to be celebratory that we want to get out of town and this warning also comes at the
27:29
end after it's processed. solve this suddenly it's told okay go back and recheck what you processed and understood to accommodate this warning
27:36
so till here it's good and then suddenly it just like plops apart
27:42
instead it's as simple as this right just gives a context like this exactly what it needs places already done
27:50
locals extensively done motivations get out of town want something different celebratory tone mood ocean views
27:58
preferred ending of the food or celebration lesserk known trails needed this weekend and won't see each other
28:04
for weeks. That's it. This wall of text is actually this is the actual materially relevant content
28:11
for the model to consume.
28:16
My girlfriend and I hike a ton is just like waste of English, waste of tokens,
28:28
right? Right. And then this old missile silos discovery point. Like what is this
28:34
about? It's just adding fluff to whichever uh
28:40
hike this is on the mountain hike. Yeah. So even like prompts that look
28:47
good can often be improved quite a lot. Right. Again I'll pause here. anything
28:53
that did not make sense, any clarifying questions before I jump into more weird
29:00
uh things on how yeah uh couple of questions here from
29:07
Pri which is where do hallucinations stand in this process I'm sure I'll answer this that's exactly what I'm getting into like how
29:13
do hallucinations happen uh can we do the fluff and ask it structure the
29:19
prompt for us and then we book that's yeah you should do that right like actually LLMs can write better prompts than people can. Uh that's been proven
29:26
time and time again. So uh that's definitely something but it helps to understand how to even ask it to rewrite
29:32
the prompt like what like this is more on how to brief it on the task so that it
29:39
can write the prompt. The prompt is still just an English structuring but the prompts the task structure is the big this is the hard part which we have
29:45
to do for it. Yeah. I mean know question.
29:52
Hey. Hi Ala. So when you gave the example of the LinkedIn viral post, uh you pointed out that you're asking it to
29:59
do too many things at once, right? Correct. But isn't that what these GPUs and all the heavy duty packets are supposed to
30:06
do to make our life easier or That's the very next slide. Yeah, they supposed to do but you do but you wanted
30:13
to do it in a way that gives you good output. Okay. And is that if you follow a
30:19
sequential lay of prompting as you had prompted in the one of the previous site would that give a better output like
30:24
first do then make it viral. Okay. Sure. Yeah. Now how to take that make a viral
30:32
write a viral B2B SAS LinkedIn post and the tonomorphis how to rewrite that is
30:37
what I'll get into in the next 20 minutes. like what to keep in your head, what are the considerations for you when
30:43
building out a prompt is exactly what I'm going to cover in the next 20 minutes. Perfect. Thank you.
30:49
Prompt tokens wisely. Again, everyone's like, I think the next 15 minutes is going to answer a bunch of these
30:54
questions, right? Rank, same thing to you. How do we use prompt tokens? Is exactly this. It's not just about tokens, but uh what kind of instructions
31:02
that you're going to uh what kind of work are you asking it to do? Right.
31:07
Cool. So let me get back to the PPT because I think this will answer a bunch
31:13
of things. This was a big aha moment for me that LLMs have compute budgets. While
31:19
they may have they make a big noise about how they have so many gigaflops of GPUs at the back end. They have a fixed
31:26
budget per conversation. They cannot throw up enough to your question throw
31:31
functionally in infinite computed. What you ask? you ask your complex task is just not
31:36
going to scale up and up and up and up to do it right. Uh secondly, that budget
31:41
whatever compute budget it's got is going to be spent across understanding what you want, figuring out follow-up
31:48
queries and planning its execution. That is basically breaking the task down
31:54
on subtask like B2B SAS LinkedIn prompt by Morpheus as first make a B2B SAS
32:00
point of view, then write the LinkedIn prompt, then make it viral, then put the Morpheus tone on it. Right? These are all subtasks. executing each of those
32:07
sub subtasks sequentially, processing the subtask results and then synthesizing final output. All this is
32:13
going to consume budget. So obviously like if any one of these is
32:18
asking too much, it's going to eat up the budget and then you're it's going to struggle. Now unlike a very
32:26
deterministic program, it will not fail when it runs out of budget. It will
32:31
struggle and make up i.e. hallucinations and context window, right? Again, a big
32:37
marketing thing. Oh, 2 million token context window, 5 million token context window. That's just storage. That
32:43
doesn't mean you can process everything in the context window. It has not said no to you giving it
32:49
content. You can give it an entire novel, but that doesn't mean you can read the entire novel.
32:55
Right? So yeah uh this is the big thing that it has a compute budget and we have
33:01
to kind of help it optimize for that and and it can't it cannot optimize it
33:06
cannot choose that okay I will go easy on the LinkedIn post writing and go hard
33:12
on the morphus tonality no it cannot figure that out it'll just spend and when it runs out it will start making up
33:18
crap right this is a great example to do this to get into this first is on that
33:24
how does that compute budget get consumed on reading your instruction itself before
33:30
it even gets into right doing the task. So if you have a prompt like this which is like do X and do Y also do Z. If you
33:38
can't do zed then try P. If you do P then also do Q. My brain is always
33:43
burning out trying to keep track of this. Yeah. How does this get processed?
33:49
It will reliably do X and Y. Sometimes it'll miss Z. This is where I was saying about it being probabilistic and not
33:55
deterministic. It'll completely ignore Q. Uh, ignore P. It'll do Q without P
34:01
because Q is at the end. It's all do Q, but it forgot to do P first. So, it'll do Q without P
34:10
because the way the compute gets used up when reading your instruction is X was
34:16
first. So, that'll get a lot of attention. It'll burn a lot of compute there. Y was next. it'll give it decent
34:23
amount. Zed will get lost in the middle. If not zed then P, this will really get
34:30
screwed because it's lower tension. It's in the middle. It's conditional compute which is expensive. So it'll say I'm not
34:36
spending time understanding this. It'll just skim it over. Then at the end it's attention will come back and say oh I
34:41
have to do Q. Let me do Q also. But it's not understood the middle part.
34:47
This is literally how it works. It's like a very sleepy person, very sleepy human on a Monday morning with a
34:53
hangover. Your boss calls you up at 8:00 a.m. on a Monday and says, "Yeah, do this. Do that. Do that also. If you couldn't do that, do this. Then do
34:58
that." Like, "Wait, what? I heard the first thing and the last thing. I'll just do that.
35:06
That's literally how they end up working, right? I spent a lot of time in the last couple of weeks with LLMs
35:12
themselves trying to decode all their uh conditions for how they pre-processing.
35:19
So this prompt itself do X do Y do Zed. Ideally you should do something like this. Do X do Y do Z. If Zed is not done
35:26
do P. If P done do Q. So basically take this entire sentence. Do Zed then try P
35:33
do P. Break it up into separate ones. have an anchor in the middle again to remind it so that it gets reinforced and
35:39
then again anchor at the end saying here again I'm telling you this is what you need to do
35:47
and it breaks down into this these are all that I found there are probably more but this should cover like 90 95% of all
35:53
the conditions that it keeps in mind that affect how an LLM even processes your instructions we've not even got
35:59
into how it works on your work this is just how it's reading your prompt right
36:04
So primacy all these are positive ones. These are all negative ones. The
36:10
negative ones are really interesting, right? Anything lost in the middle. Any instruction in the middle of context will get screwed. Uh your thing is very
36:17
complex. Too many nested clauses, dependencies. Like I said, if you've not done this, then do that. But you may
36:22
also need to do that, right? uh if it is dependent on four other
36:30
things happening first it can very likely to fail if the earlier step was forgotten.
36:37
If you say do this and do if you ask it to do write a code snippet and also
36:43
write a poem, it's going to get confused like what do you really want me to do bro? Right? If you this is a great on
36:52
the code example and poetry example. If you say uh
36:57
I need a way to calculate how many days are left in the year and you say write a poem on it, it's like
37:05
they don't make sense. It's very tangential, right? Too many open conditions, which is what we had in that
37:12
uh this bad prompt. This one open 7-day workshop. Too many conditions, too many
37:18
things open. It doesn't know what to do. So, it's going to again just
37:23
overheat its internal brain, right? Context window exceeds size, it'll start
37:30
chopping. it'll just cut stuff that it cannot handle just to keep whatever more that you're giving into the context
37:36
window right uh these are uh this is probably
37:42
the one which we miss out on a lot because it's a simple text box in most charg
37:48
uh just giving it numbering giving it bullet pointing giving it unique phrasing all this really helps give it a
37:58
just make sure that this instruction is not missed Right? And I'm sure we've all come
38:03
across this. We've given it a long prompt and like I told you to do four things, four things and you did two.
38:08
What the hell is wrong with you? You forgot this and you to go back and tell it because something here has
38:16
gone gotten confused. Yeah. Take a screenshot of this or take
38:22
it extract this. I've printed this and kept it on my desk and I'm like, h these are things I have to keep in mind when I'm writing my instructions.
38:29
Yeah, cool. I'll just pause here. Any more questions? Because I'm going to get into uh how they further into how they
38:39
uh process instructions.
38:51
Yeah, yeah, you do. You'll see this with all models. It's it's the way product transformers work. It doesn't matter
38:56
with GPT or a GPT API or perplexity or uh Deepseek API. This is how they will
39:02
read. They all have a compute budget and if you start confusing them, they will just short circuit and not tell you
39:08
about it and they just make up stuff because they want to please you so badly.
39:13
Yeah. And what I've realized is that LM think they're PMs. Yeah. They want they have a
39:19
lot they think they have to design the entire system instead of just doing the task. No criticism on PMS, but they get
39:25
into a lot of stuff. So look at these two tasks. We're going to build a web app and then you say three tasks on UI,
39:32
three tasks on front end, 3,00 on back end, 3,000 on the database, 12,00 on UI.
39:37
Any thoughts which is the harder one for it to do.
39:47
Second one. I heard a second. Any other thoughts?
39:54
Right. I think the second one will be harder.
40:04
So they're actually both bad. The second one's actually slightly easier. So the way the compute gets used up on this
40:10
task is a lot of load will go switching between task types because each of these
40:15
is going to be a different kind of work right UI is different front end back end
40:21
it will have it'll spawn a lot of questions on dependencies some of those will get addressed but there's no way
40:27
all of them are going to get addressed so some will get hallucinated here there's lower load
40:35
but there on switching task but there's very high load on guessing the dependencies because you ask to do only UI and not think about anything else by
40:42
implication. So all dependencies will get hallucinated and your later rewrites when you then
40:48
say okay now let's fix for the front end let's fix for the database connections they may not catch everything but what
40:53
you will get here is a much better UI than this because it's not spending load
40:58
on switching between UI front end back end database it's just doing everything on UI so you'll get good UI but all the
41:04
connectors all the dependencies everything will get hallucinated because it has no idea here what to
41:12
So both have a problem. Uh UI quality this will be better in terms of just how
41:18
much mess you have to fix under the hood. This will be better
41:24
because it's managed to say okay UI has to connect to the front end. Okay, I'm building the front end. So that's how it
41:29
connect to the UI. So something will get solved but not all of it. Both of these will have holes in it where it is just
41:35
made up stuff. So, how do we fix this? The obvious thing would be to probably
41:41
give it a full PRD with architecture and then ask it for that. And we've done
41:47
this, right? We're like, okay, we need to do let me just give it the full give it a dump. This is my entire product
41:53
documentation. Write a uh synthesis of it. What happens here? No, all the load has
42:00
gone on understanding the PR, but you're still maintaining that high load on switching between task types. Now, the
42:07
PR can't answer every single question, right? There's no such thing as a PR that answers every single
42:14
concern and dependency and follow-up question when building an app. That's not possible, right? You will get more
42:20
coherent output. Yes, fewer dependencies, but you're still on high load. Now if your PD is very long and
42:25
verbose and uh thing you're going to cause there going to be other problems on it just consuming and understanding
42:31
everything whereas this stays the same. So we kind
42:37
of saw to solve the problem but it's still a problem. You're still going to get dependencies and hallucinations because it doesn't know what it's doing
42:43
and it's making up stuff. So then what's probably the best way to
42:48
do it? Start with the PRD. Give it the PRD. Ask the LM to generate the schema
42:54
or the guardrails around how to work. Then give this as an input and say these are my three tasks on UI. Then these are
43:00
my three tasks on front end. These are my three tasks on back end. These are my three tasks on DB. And over here after
43:06
it does the guardrails have human in the loop to check that like I have you made
43:11
your guardrails correctly
43:18
because under the hood all this is happening. It's just like a it is struggling to understand everything and second it is
43:25
not able to answer all its questions for itself. So it'll make up stuff. It is not like a junior engineer will
43:31
come back and ask you what should I do with this? What should I do with that? How does this connect to that? What should be my error code for this? It'll
43:38
just make it up. Which is where a lot of complaints come
43:43
from full-blown engineers that code is unmaintainable. AI code is
43:49
unmaintainable because it's made up stuff.
43:55
Yeah. Now the same logic I used a web app which is obviously like when you're writing code very interconnected
44:02
activity but the same thing applies probably with less sensitivity but it
44:08
applies for any interconnected question like planning a party. You say plan a party these are the three tasks on
44:13
catering. These are the three tasks on invitations. These are the three tasks on venue. These are the three tasks on return gifts. Again, it will just make
44:21
up stuff on things that it does not understand or is not clearly answered for it.
44:28
Ask clarifying questions. That seems an easy way to get around this. No, that increases the compute because now it is
44:33
doing gap analysis, asking questions in addition to understanding the prompt and making it for making it stars because it
44:40
told it to do 10 different things. It has to do that work, but it's now also doing this. You're just blowing up
44:45
comput. This is the worst. I've done this so many times and never realized that this
44:51
is so bad because the dependencies is something it can't not
44:57
worry about. It will do that. It will start thinking about dependencies.
45:02
But then now you're layering a suppression sub routine on top to run on top of that dependency reasoning. So
45:08
this is like saying solve this calculus problem. Do not think of elephants. Now obviously you're going to think of elephants. Yeah.
45:15
How do you not do that? Right? And uh yeah, giving it full context is
45:20
double-edged. Like I said, you will get address some of those unanswered questions, but instructions can get lost
45:26
in the middle. Critical content can get lost in the middle. Context window can get breached if it's huge or very
45:32
complex, if it has images in it, stuff like that, right? So there's some stuff to realize is how me complex it is
45:40
behind the back end. uh when you ask it what seems like a fairly straightforward
45:46
prompt like this right good segue for me into codebase codebase it's ulta the
45:52
problem is not understanding the task the problem is understanding the codebase that's where all of its compute
45:58
gets killed right so it's almost always better to constrain the lm to the exact
46:03
files or functions to look at if you say make these changes in the code and it has to read the entire code that's where
46:10
its comput is getting chewed up. That's where it's context getting chewed up and that's where it makes the mistakes. The
46:16
exceptions are obviously things like refactoring which obviously it has to look at the entire code base. But otherwise as much as possible constrain
46:23
where it looks at. Now often we don't know where we don't
46:28
know the codebase well enough. Yeah. Like if it's our company production code we can't tell it every time look at this
46:33
function or look at this file. So pre-coding task let it read the entire
46:39
codebase generate its own highly efficient cheat sheet of what is where what are the dependencies everything
46:46
right similar to reading a PRD and building a schema but this is for an existing codebase versus building fresh
46:51
code then when it comes to codebase every time tell the LLM look at your
46:57
concern native index look at a cheat sheet before you decide what you're going to do don't go back to the
47:02
codebase and get exhausted And if you want this is one thing I've
47:09
thought of but I haven't tried myself is let it make an index that for itself that it refers to and one in simpler
47:15
English almost like reverse engineering PRD from the code base so that you can read and in a quick glance also
47:21
understand what is its meta instructions that it's looking at.
47:28
Yeah, cool. That covers what we on how it
47:33
processes instructions. Right? I'll pause here. We basically covered the way it gets lost in different instructions.
47:40
Uh what gives it primacy and what it does not and how it kind of spawns
47:46
different tasks under the hood and then gets lost in that and starts hallucinating because it doesn't know the answer to everything.
47:53
No, you can't buy more compute for instruction. Maybe you could run an open source or self-hosted, but uh at least
48:01
like your GPTs and all that. No, that's set at some global level, right? And
48:07
obviously that's real time. If you do it at like 2:00 a.m. US time, you're obviously going to get more compute budget than if you do it at 2 p.m. US
48:13
time, but there is always going to be a like limit on how much it's going to spend on this.
48:22
How should we structure the PRD for a better outcome? Ask it to structure the PR for a better outcome.
48:27
Let it read the PR in pieces. Break it down into chunks. Build its own cheat sheet and then say refer to this cheat
48:33
sheet every day.
48:41
So how does computation work on a follow-up? It's what I've understood and
48:48
uh probably guys working at OpenAI cla know it better but what I've understood is it's per conversation the context and
48:56
the compute budget is per conversation. So it will you'll get what you will do
49:01
is that at a time if your task is if you break it up into task you'll get better output because at that time it's
49:07
spending less but it's still spent more. So over time it will get uh exhausted.
49:13
So which is where it's always better to do like okay pause here review everything that you've done and create a
49:19
summary document and use that as your reference point and go ahead if you're doing something very long right if you're talking to it over 2 three days
49:25
on like system design or uh code architecture or marketing strategy or
49:30
something like that right what else
49:38
any question someone had raised their
49:48
I have a question. Yes sir. So uh basically uh like we keep hearing
49:56
that you know everything is getting automated or will be getting automated soon. So is all this hype or uh or we
50:04
don't know basically what I understood from the session is obviously right this the the things which you have explained I have never seen anywhere. So getting
50:12
to prompting a better is something and then all the LLM. So LLM can do all the
50:18
test provided we prompted right is this we can say or not. So I have a slide at
50:24
the end but basically what's progressing right as from GPT3 to GPT 5 if I take
50:31
that or take cloud 2 to cloud 4.1 the floor or the minimum quality output for
50:38
a lazy prompt is rising okay right so you give give a lazy prompt to
50:44
GPT3 you got nonsense you give a lazy prom to GPT5 you'll still it will be less nonsense
50:51
okay but the Same time if you give a good prom to GPT3 obviously you'll get a
50:56
better output that same good prom to GPT5 that delta the it's more better a lot the
51:04
improvement is a lot more so you are punished less for a bad prompt but you're rewarded more for a good prompt
51:11
okay right so towards automation and all see
51:16
a lot of this automation is going to be how well you can do it a lot of it is it depends
51:23
Okay. Right. And there's a 100 considerations on what is the model fine-tuning the data that you're given the prompts that
51:29
are there. So many considerations. So yes, it's possible but uh yeah a lot of
51:35
it is like tomorrow you're going to lose your job or like tomorrow marketing teams are going to get removed is a
51:40
little bit of I think hype right even famously like removed their entire customer success team and now they're
51:46
rehiring for the same function. So uh I think it'll happen to an extent. Uh what
51:51
will happen is very structured task will get AID and like a lot of judgment
51:58
related calls will still stay with people. Yeah. Judgment related. Okay. Yeah. Okay.
52:08
Cool. and I ask in sermon summarize what it
52:16
correct exactly that that it's not having to go back and eat
52:23
compute and eat context to remember your entire conversation it's condensed down into something very efficient for it to
52:30
refer to cost on speed what do you mean by cost and speed after every task we have to summarize
52:37
and then move ahead so it kinds of a half your speed of developing anything
52:45
of yes and no. So that's what I was saying right like the stronger model a better context better way of
52:50
understanding you probably don't need to summarize after every single uh task but yeah that's a bit of a judgment call
52:57
depending on the task like how often do I need to create a safe point that uh
53:08
is there a way that prompt engineering works differently on different models is there sign that this works on GPT versus
53:16
this works on cloud or small same no probably certain things work better
53:22
on X versus Y certain things work less better on X versus Y but whatever I've
53:27
seen this has been very universal like it's not uh because of underlying tech
53:33
is transformers right which is the same across everyone uh training data is different specific budget allocation or
53:40
breaking down task may be different so but I think that is like a 90 to 95 95 to 100 It's not like this does not work
53:48
on cloud at all and this works really great on GPT. I don't think there's going to be anything like that.
53:55
So when when you're into full scale product development, is there merit in
54:00
deciding which models to use or just you just focus on prompts? There's pro there's merit in both for
54:06
sure because you can take a great model like uh say for coding like cloud 4.1
54:11
and have rubbish prompts and you'll just the prompts prompts we need that's be zero. But if we got the best prompts
54:19
then model does not matter or it should still matter. Yeah, because again it's on how the training and
54:25
inference and all that has been set up as well. And how do we crack that? How do we
54:32
those there are scoring models I think for different things like I think GPT5
54:37
was growing a lot on how they matched a lot on coding task now.
54:43
Okay. But yeah, I think that's probably the best one. Or yeah, honestly like
54:49
just get an open router subscription and try it with four five models at once and see which works best for your use case,
54:55
right? Because there's so much which depends on context and input and your prompts and I mean just yet deepseeek is
55:02
working well. Why don't I just use that? There's no I think experimentation is a good way to get there.
55:09
Like I personally for my thing I keep switching. I use cloud as my daily driver and I switch to open uh GPT for a
55:15
few things because I've just found that this works better. I don't have a hard and fast reason why that happens.
55:23
Cool. Uh let me skip uh get ahead because I still have I think another five 10 minutes worth of uh content to
55:30
cover. Right. We talked about how they work, how they process instructions, but what about tasks, right? Like back to V
55:37
viral post. So there are different tasks and each of them are different difficulty for an LLM
55:43
right. So each of these have different loads. So like basic recall is very easy. Local reasoning is very easy. Like
55:50
uh if you go we go back to that chain of thought on doing time management that's easy. Systems thinking is very tough.
55:58
Code it depends because it has a lot of knowledge on code but it has to handle a lot of
56:03
constraints. Coding is itself not easy. Creativity is harder than generation. So writing a LinkedIn post is the easier
56:12
part versus write it in the creative style of Morpheus's dialogue in the matrix. That is the harder part. Right?
56:19
Multistep is difficult. It gets exhausted on this very fast. Right? So this is also very good thing. Screenshot
56:24
this, print this out, keep this as a cheat sheet because this is a major thing on how to break up your task. And then you go back and oh, I'm asking for
56:31
it to do this and this and this out of which this is an easy one and that's a bloody tough one and I should probably
56:37
break it up, right? So like even this one, write a viral
56:43
post on B2B SAS. You're asking for all this to happen.
56:49
Recall retrieval on B2B SAS and Morpheus and LinkedIn post conventions. Manage all its constraints. Be creative. do
56:57
some systems thinking around tying all this together. Generate language.
57:03
Combine everything. Right? So this is easy. This is semi easy. This is tough.
57:09
This is incredibly tough. This is four and six are insanely tough. This is semi-tough. And we're asking for all of
57:15
this at once. It doesn't know how to prioritize. It tries to do everything at once. which is typically if you give this you'll get a very meh content four
57:24
on 10 three on 10 content with good morphus style or the reverse you'll get like
57:30
great insight but it's like yeah where is the morphus from the matrix dialogue in this right uh that's what'll happen
57:38
so then of course there's the extra load to balance everything switch between doing
57:44
this and doing that so it is it gets exhausted and then finally Finally, how do I
57:49
actually do this? The prompt also stuck tucks, right? Like what is viral? What is tone? Which matrix movie? Morphus is
57:58
a complex character. He's lot had lots of dialogue. Which phase of that? Right? Then contradictory instructions. Can I
58:04
just drop this? Like these are all potential questions. It's asking itself in the back end. It
58:09
will not ask you because it just wants to guess what you want. Yeah. Instead, this is what I'll do.
58:15
First, I would remove the variability or the probabilistic nature of what is
58:21
viral. Let's remove interpretation from that. I'd give it 10 posts, ask you to build a virality cheat sheet, including
58:27
a way to score post. This is an important one, and I'll tell you why. Then I'll say, let's build our point of view based on B2B SAS post that I found
58:34
insightful. Let's build a point of view. Here are my last 10 posts. Next step,
58:40
write a style guide for me. Then combine the point of view we had and the style
58:45
guide. Let's write a post. Let's not apply virality. Then I'll write tree of thought. Now because why tree of
58:51
thought? Because I having written the post. Should I first make it viral and then add the Morpheus dialogue on top or
58:57
should I do Morpheus first and then make it viral? I don't which is going to be better. So root one I'll say let's do it
59:02
Morpheus style then make it viral. Route two reverse it. Score both roots for on
59:09
vir on the virality cheat sheet. Give me whichever come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come come comes out first.
59:15
So what happens is you're breaking up the task the virality solved here the
59:22
synthesis inside cross domain analytical part is solved here the how to write is
59:29
solved here uh each of this is now getting into separate task right and to do this take an input and to uh someone
59:36
else's question where do it probably take a save like I put a save point here and I put a save point here it can
59:43
probably hold this in memory but if it forgets it then I can come back right
59:48
and then this even I don't know what is the uh route to take so let's
59:53
try both routes and see which works better probably get a better output in this flow over 20 minutes then going
1:00:01
back and forth back and forth trying to do give it this and then try to optimize
1:00:08
that make sense
1:00:14
yeah makes sense Yeah. And this is what I was saying, right? Like lazy prompt will start here that it's
1:00:22
more forgiving. It'll still figure it out. But a good prompt, the ceiling is just going up and up.
1:00:30
So yeah, on a dayto-day everyday like chatting on the phone, you can get away with a lot more lazy prompting in GP5
1:00:37
now than in GPT3. But at the same time, the quality output is just shooting up if you can really work with what
1:00:45
prompting does.
1:00:51
Cool. Uh, that's all I had, guys.
1:00:57
I saw one more question. Yeah, man.
1:01:12
Man, do you have a question? I think he left. Okay.
1:01:19
Yes. So, one one question I have the example you showed for this LinkedIn post. Are we passing everything in a
1:01:25
single uh prompt or means it's a single or it will be step by step? A prompt?
1:01:31
It will be step by step. Okay. So every bullet point here is a single
1:01:38
point and the second and the sub the subsequent step will contain the uh
1:01:46
so won't it context mean basically the context might get increased right so I
1:01:52
will pass the conversation first second third and the subsequent yeah but see like I've built save points
1:01:57
right so all its work on it doesn't need to remember these 10% virality
1:02:04
okay it's built a cheat sheet and it's got a scoring mechanism so it can forget that because I'm not going to reference this
1:02:10
also these 10 posts from a context window this will probably
1:02:16
be enough because now all of them have a big context window million plus right so it'll sit in it storage but I am asking
1:02:23
it to process this one time build a cheat sheet I'm not coming back to reading these 10 posts
1:02:30
similarly here five posts that I found insightful process this come up with POVs We'll close that loop on POVs.
1:02:37
We're not going to come back and reread these five posts. So, it can sit in your storage, but we're not processing it anymore.
1:02:43
Same here. My last 10 posts. Write a style guide. Again, safe point. We don't
1:02:48
need to keep going back and reading these 10 posts. However, if you said here are 10 posts
1:02:54
that went viral, these are 10 posts I wrote. These are five posts on B2B SAS that I uh found insightful. Now, do all
1:03:01
these three tasks together. Yes, exactly your point. It'll explode. So do we need to use something lang
1:03:07
chain or lang graph for these kind of things or it can be still possible with a this is a GP only
1:03:13
okay uh but in GPT let's say I have a I have open a conversation so I give one thing
1:03:21
okay so it will be uh so all these things will be then managed by GPT right we need to pass this instruction and the
1:03:26
GPT will manage all these things correct Okay,
1:03:36
just one last thing from me there. So like you mentioned points right which I think everybody would have liked so
1:03:42
much. So how do we learn right? So everybody we keep saying get better at working with AI. So does this means
1:03:49
getting better at prompt engineering?
1:03:55
Uh see prompt engineer is going to help you wherever you're doing it. You're doing something in lang. You're doing
1:04:00
something lovable. You're doing something on NA10. You're doing something on chat GPT. Everywhere there are prompts.
1:04:06
Okay. So you build that muscle to do prompts. It helps you everywhere. Yeah. And how do we uh so we just because I
1:04:13
have given so many prompts, right? Every everybody is everybody's giving but I have not realized these things. Okay.
1:04:20
Whatever output is is giving we are just uh you know adjusting to it or finding it. Oh, it's better or it's good. So
1:04:27
like the things which you have provided right how we can develop obviously we have got a base point so how do we move
1:04:34
further or keep advancing uh uh the way you have suggested or the way you are
1:04:39
doing if we can get some idea on that so for me emotionally it's more frustrating
1:04:46
and more irritating if I have to correct and optimize an LLM
1:04:52
okay right so if I give it this basic prompt and it gives me some nonsense 4 on 10
1:04:58
quality and I have to improve on that. That is more exhausting and frustrating for me compared to doing this.
1:05:07
I would rather do this oneshot it done. Got it. Got it. And what I will also do is I will ask it
1:05:13
output this as an MD file, output this as a CSV file. I'll take all these cheat sheets and keeping it. Next time I'm
1:05:19
doing something, if I want to write a viral LinkedIn post on something else, I'll reuse this virality cheat sheet.
1:05:25
Yeah. Okay. Got it. Then I can skip this step step. Make all
1:05:30
these one time activities. Got it. Got it. Next time if Okay. If you're doing
1:05:37
something like asking perplexity, what is the stock price of uh monday.com
1:05:42
after it fell? That's a trivial post. But you're doing something for work. You're doing something complex.
1:05:48
see how you can say okay can I do this in one sequence whereas having to correct it or improve on its output
1:05:57
then you're actually engineering versus just throwing something at it seeing if it worked and then okay now I'll fix it
1:06:03
actually engineer it from day one and see how well you can get at it why because doing it for something simple like writing a post writing a blog post
1:06:10
for my work or something like that you'll build that muscle it's like going to the gym you build that muscle tomorrow you can use it for hockey You
1:06:17
can use it for lifting a suitcase. You can use it for uh lifting a bike after it's fallen. You build that muscle. You
1:06:22
can use it wherever. Tomorrow you're building a I built a lovable app like 4 months ago. I look back at that system
1:06:28
properly. I'm like, yeah, rubbish. What nonsense I wrote. I thought it was very good then, but now I'm looking back and
1:06:34
like dude, this is absolute rubbish. Right. So, it just gets better over time. And then wherever everywhere you
1:06:39
have to write a prompt. Yeah. You're creating an NA10 workflow to say process uh
1:06:47
uh support tickets coming in by email and send it out on Slack. Somewhere in that flow there is a
1:06:54
uh AI in the loop and there is a prompt. No. Okay, got it. So
1:07:00
everywhere prompts show up everywhere. Yeah, I'll share the notion doc that I have
1:07:06
because this has a where is that?
1:07:16
Yeah. So, this is also pretty cool, huh? Like
1:07:21
this is a leaked GitHub repo with all the system prompts from a bunch of
1:07:26
tools. This is very cool to look through. This is like the best in the business. This is the system props behind Poplexity or uh this is like very
1:07:34
interesting to read also and you realize okay even these guys can really write the great pops. There's a lot of f in this also. I'll share both the notion
1:07:41
which has all these links and a hell of a lot more as well as this PPT
1:07:46
right like uh which one did I look at which looked like absolute lovable I was
1:07:52
very not impressed with that prompt yeah
1:08:02
like I'm already seeing a bunch of things that we covered in the session which are not uh there but there are
1:08:09
some things which are right like uh
1:08:16
but huh go back and look at these because these are very very stress test this is this prompt is handling the
1:08:23
system prompt is handling millions of inputs a minute
1:08:28
okay yeah because every prompt you give to lovable is being handled by this as a
1:08:33
system prompt before it generates code this is the prompt that reads your prompt. So this
1:08:41
prompt is reading millions of prompts a day. Got it.
1:08:46
So these are pretty interesting read as well. So yeah, just get into this and it'll it'll take some time like uh even
1:08:52
I'll give myself only like a three four on 10 on top of what really can be achieved out of prompting. Uh and I
1:09:00
spend most of my time on prompting and a lot less on actually building systems because that's just what my work is
1:09:06
needed, right? Okay. If you are on three and four, then I think
1:09:12
there's a lot on zero or minus one. I realize I think all I'm doing is all the wrong things.
1:09:20
But even I'm doing a lot of the wrong things. Yeah, we're all doing a lot of the wrong things because you once you realize key it doesn't even understand
1:09:26
my instructions. I told it to do A and B and C. C is stuck in the middle. It forgot.
1:09:31
Yeah. Oh, should I have said C or should I just ask it to do A and then wait? Like your entire brain gets rewired on how
1:09:38
you instruct this. Got it. It's like telling my three-year-old, I
1:09:44
say, "Go put your shoes and then go wash your hands." He'll put your shoes, he'll forget washing his hands.
1:09:50
Yeah.
1:09:57
Yeah. Understanding under the hood helps because if you understand how it processes the instructions and breaks down the task, then you know how to give
1:10:04
it instructions, right? Awesome.
1:10:15
Any other questions, folks? Before I see this thing about JSON input output. If people have time, you can
1:10:20
drop it anytime. This is just uh off the grid. I can show you what I've done for work. Let me find uh where is GPT?
1:10:29
Yeah. So, this I've done for work. What I made is this which let me go into GPTs.
1:10:36
What I did is I'll show you how it's made. Oh, wait.
1:10:43
I'm not sharing my screen anymore.
1:10:51
Yeah. So, this is my work GPT. It's used across a team and I built this custom
1:10:57
GPT called Graphics Maker. What I did is I gave it like 50 of our blog images,
1:11:02
blog cover images and asked it to make a a rule set. Then the system instructions are you
1:11:10
will create images based on a rule. You'll get a request to build an image. You will ask the form which is square,
1:11:17
vertical or horizontal. And this is all like error catching.
1:11:26
Then your task is twostep. Generate a JSON spec of the image to be built from the
1:11:32
output and then based on the JSON create the
1:11:37
image. So there's a JSON in the middle between the prompt you gave it to generate an image and the actual image
1:11:43
generation call. So if I you if I use this
1:11:51
give me a prompt for an image like we can do it for this session.
1:11:57
Yeah, it'll happen in one uh 10. Generate an image to show a person holding
1:12:06
a group. It's not going to generate an image. It's ask okay format. I'll say 16x9. I
1:12:14
want to go vertical. It generated a JSON spec.
1:12:21
It's not generated an image. Now with my approval, it will generate the image. Now generating the image, the input is a
1:12:26
JSON spec, not my prompt. My prompt is as lazy as it gets. Yeah, this will get me nonsense if I send this directly to
1:12:32
image generation. But it's generated this. I won't generate the image itself. I'll show you my library of images.
1:12:39
What it does as you can see is it generates on brand images every time. 1 2 3 4
1:12:48
5 6 7 All this is generated on brand.
1:12:54
This is pretty good. Yeah, because it is following the JSON is generating the JSON based on the rule
1:13:01
set that I gave it trained on my uh
1:13:06
the existing brand. Uh correct. So it's gone from probably guessing what you want to being totally
1:13:13
deterministic on the style. Only input is what has to go in the content.
1:13:19
Interesting. Right. So if you look at the JSON, the only thing which is coming from my
1:13:25
prompt is this description line.
1:13:32
Oops. Only this line description is coming
1:13:37
from my prompt. Everything else is coming from the style guide.
1:13:43
Interesting. GPT project. Yeah, there's a GP project.
1:13:50
Okay. Font, spec, size, font, everything is pulled from the spec, not from my
1:13:56
prompt. not uh and then the image generation is
1:14:01
following this exactly like no room for discretion guessing what font color size nothing is left to it to guess
1:14:09
is it somewhat uh unmarable is it somewhat probabilistic to
1:14:15
deterministic you can make it yeah that's basically what I've done I've given it taken away its entire
1:14:21
ability to guess this is exactly what I want color font size everything is speced out
1:14:28
for Don't guess helps clearly. Thank you.
1:14:35
Even in the previous one, right? When I'm saying make a virality cheat sheet, this is what I mean by virality. Don't guess
1:14:54
cool. Uh unless any more questions uh I will give everyone the Saturdays back.
1:15:00
Sorry I went a little over but uh no this is fantastic. Any other
1:15:05
questions folks?
1:15:12
Awesome. Okay this is brilliant. uh pretty pra and I are discussing our chat
1:15:19
like now now we're looking at front uh engineering as complex as writing code
1:15:25
now yeah it is writing code only no they've scammed us with other marketing
1:15:30
that this GP is some super intelligent human you can talk whatever way you want in their own live stream it says just
1:15:36
write a make a snake game make it look nice and you expect it to give something yeah exactly
1:15:41
right but it's actually a scam it is it's program do programming. Yeah. Yeah. There's just no syntax in natural
1:15:47
language programming. Correct. Exactly. It's very forgiving natural language programming.
1:15:52
Awesome. So I'll get the uh you said there is a notion document that you can share and also the PPT, right?
1:15:59
Yeah. I'll share both with you. Yeah. So we'll we'll put it on uh YouTube by Monday uh along with the share. I think
1:16:06
thank you so much. This was quite brilliant. Um I learned a lot personally. So uh thanks a lot for
1:16:13
spending the time and thanks a lot folks for spending your Saturday with us. Yeah go back into this. It'll take some
1:16:20
time for it to sink in like it's a little bit of brain rewiring to be done but uh just my last you as right last question.
1:16:27
So understanding means understanding the transformer architecture. No just how does it work?
1:16:33
How does it process your instructions? Okay. Okay. I think no need to go into that LLM workings and all those things
1:16:39
right. It's not required. not required. In fact, if I were to summarize two things to get deeper into how does it
1:16:45
process instructions, how does it break up subtask? Okay, if you can get that sinking deep into
1:16:53
your head, now half the problem is solved. Okay, then you'll at least be able to recognize when you give an instruction,
1:16:59
oh, this is a bad instruction. It's too much. Or I'm asking you to do this and that and that and this and it's it's going to
1:17:05
get into trouble. Okay, you become wise. you can become wise
1:17:11
then. Yeah, you'll at least know. Okay, it's like uh telling a fresher boss go to
1:17:17
execute this entire event for CXOs. Like obviously it's going to fall apart,