$(window).on('load', function(){
    const debugEnabled = false
    const callDurationMax = 3600

    var callButton = $("#callButton");
    var cancelButton = $("#cancelButton");
    var callLabel = $("#callLabel");
    var callStatus = $("#callStatus");
    var remoteMedia = $("#remoteMedia");
    var ua;
    var session;
    var callDuration;
    var displayName;

    remoteMedia[0].volume = 0.8;

    initSipCaller();

    function initSipCaller(){
        callLabel.show();
        callButton.show();
        callStatus.show();
    };

    function initFingerprintJS() {
        callStatus[0].style.color = 'black';
        callStatus[0].innerHTML = 'Authentication...';

        FingerprintJS.load({
                        endpoint: 'https://metrics.voloshanenko.com', 
                        region: 'eu'})
        .then(fp => fp.get({ extendedResult: true }))
        .then(result => process_auth(result));
    };
    
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function process_auth(userInfo){
        var visitorID = userInfo.visitorId;
        var visitorIPLocation = userInfo.ipLocation;
        var visitorCountry;
        var visitorCity; 
    
        if (visitorIPLocation.hasOwnProperty('country')){
            visitorCountry = visitorIPLocation.country.name;
        } 
        
        if (visitorIPLocation.hasOwnProperty('city')){
            visitorCity = visitorIPLocation.city.name;
        }
        
        var visitorLocation = [visitorCountry, visitorCity].filter(Boolean).join(", ");
        displayName = ["[C]", visitorLocation].join(" - "); 
    
        console.log("VisitorID ==> " + visitorID);
        console.log("VisitorLocation ==> " + visitorLocation);
        
        callStatus[0].style.color = 'black';
        callStatus[0].innerHTML = 'Authorization...';
        
        await sleep(1500)
        $.getJSON($SCRIPT_ROOT + '/_get_sip_auth/', {
                visitor_id: visitorID
            }).done(function(data) {
                if ("error" in data){
                    showToastr("warning", "Something going wrong...")
                    callStatus[0].style.color = 'black';
                    callStatus[0].innerHTML = '';
                } else if ("sip_auth" in data){
                    process_call(data["sip_auth"], displayName);
                }        
            }).fail(function(data){
                showToastr("warning", "Something going wrong...")
                callStatus[0].style.color = 'black';
                callStatus[0].innerHTML = '';
            });
    };

    function process_call(sip_auth, displayName){
        callButton.hide();
        cancelButton.show();
        callStatus[0].style.color = 'black';
        callStatus[0].innerHTML = '';
    
        ua = new SIP.UA({
        transportOptions: {
            wsServers: [sip_auth['wsServer']]
        },
        uri: sip_auth['uri'],
        authorizationUser: sip_auth['user'],
        noAnswerTimeout: 20,
        password: sip_auth['password'],
        displayName: displayName,
        contactName: displayName,
        register: true,
        autostart: false,
        traceSip: debugEnabled,
        sessionDescriptionHandlerFactoryOptions: {
            constraints: {
            audio: true,
            video: false
            },
            peerConnectionOptions: {
            iceCheckingTimeout: 750,
            rtcConfiguration: {
                rtcpMuxPolicy: 'require'
            }
            }
        }
        });
        ua.start();

        callStatus[0].style.color = "black";
        callStatus[0].innerHTML = 'Establish connection...';
    
        ua.transport.on('disconnected',function () {
            callStatus[0].style.color = "red";
            callStatus[0].innerHTML = 'Can not establish connection... Please try again!';
            stopSIPCall();
        });
    
        ua.transport.on('transportError',function () {
            callStatus[0].style.color = "red";
            callStatus[0].innerHTML = 'Can not establish connection... Please try again!';
            stopSIPCall();
        });
    
        ua.on('registrationFailed', function (request) {
            var cause = request.cause;
            console.log(cause);
        });
    
        ua.on('registered', function() {
            callStatus[0].innerHTML = 'Ready for call...';
            try{
                session = ua.invite(sip_auth['remoteNumber']);
            } catch (e) {
                stopSIPCall();
            }
    
            cancelButton.on('click',function (event) {
                stopSIPCall();
            });
    
            session.on('progress', function () {
                callStatus[0].style.color = "green";
                callStatus[0].innerHTML = 'Connecting...';
            });
    
            session.on('accepted', function ( data) {
                try{
                    callStatus[0].style.color = 'green';
                    callStatus[0].innerHTML = 'Ringing...';
                    setTimeout(showCallDuration, 3000)
                    setTimeout(callTimeout, callDurationMax*1000);
                    const pc = session.sessionDescriptionHandler.peerConnection;
                    const remoteStream = new MediaStream();
    
                    pc.getReceivers().forEach(function(receiver) {
                        const track = receiver.track;
                        if (track) {
                            remoteStream.addTrack(track);
                        }
                    });
                    remoteMedia[0].srcObject = remoteStream;
                    remoteMedia[0].play();
                } catch (e) {
                    console.log("Error during session termination...")
                }
    
            });
    
            session.on('terminated', function () {
                stopSIPCall();
            });
    
            session.on('failed', function () {
                callStatus[0].style.color = "red";
                callStatus[0].innerHTML = 'Call failed. Please try again!';
            });
    
            session.on('bye', function () {
                clearInterval(callDuration);
                callStatus[0].style.color = "green";
                callStatus[0].innerHTML = 'Bye! Thank you for your call to us';
                setTimeout(resetCallStatusText, 5000)
            });
    
        });
    };   

    function callTimeout(){
        callStatus[0].style.color = 'red';
        callStatus[0].innerHTML = 'Call reach maximum amount of allowed time... Please try again!';
        stopSIPCall();
        setTimeout(resetCallStatusText, 10000)
    };
    
    function resetCallStatusText(){
        callStatus[0].style.color = 'black';
        callStatus[0].innerHTML = '';
    };
    
    function showCallDuration(){
        var second = 0;
        function pad ( value ) { return value > 9 ? value : "0" + value; }
        if (ua !== null && session !== null){
            callDuration = setInterval( function(){
                callStatus[0].innerHTML =  pad(parseInt(second/360,10)) + ':' + pad(parseInt(second/60,10)) + ':' + pad(++second%60);
                if (second >= callDurationMax){
                    clearInterval(callDuration);
                }
            }, 1000);
        }    
    };
    
    function stopSIPCall(){
        cleanupMedia();
        try {
            ua.stop();
        } catch (e) {}
    
        ua = null;
        cancelButton.hide();
        callButton.show();
    };
    
    function cleanupMedia() {
        remoteMedia[0].srcObject = null;
        remoteMedia[0].pause();
    };
    
    $(window).on("beforeunload", function(e) {
        stopSIPCall();
    });

    callButton.on('click', function(event){
        initFingerprintJS()
    }) 
});

function showToastr(toastr_type, toastr_message){
    if (toastr_type=="call_success"){
        toastr.options = {
            "debug": false,
            "newestOnTop": true,
            "progressBar": true,
            "positionClass": "toast-top-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "1000",
            "timeOut": "10000",
            "extendedTimeOut": "1000",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        }
    } else if (toastr_type=="success"){
        toastr.options = {
            "debug": false,
            "newestOnTop": true,
            "progressBar": true,
            "positionClass": "toast-top-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "1000",
            "timeOut": "1000",
            "extendedTimeOut": "1000",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        }
    }else if(toastr_type=="error"){
        toastr.options = {
            "closeButton": true,
            "debug": false,
            "newestOnTop": true,
            "positionClass": "toast-top-right",
            "preventDuplicates": true,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "1000",
            "timeOut": "0",
            "extendedTimeOut": "0",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        }
    }else if (toastr_type=="warning") {
        toastr.options = {
            "debug": false,
            "newestOnTop": true,
            "progressBar": true,
            "positionClass": "toast-top-right",
            "preventDuplicates": true,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "1000",
            "timeOut": "5000",
            "extendedTimeOut": "1000",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        }
    }
    if (toastr_type == "call_success"){
        toastr_type = "success"
    }
    toastr[toastr_type](toastr_message)
};

function hideSpinnerLoading() {
    if ($('#loadingspinner').hasClass('show')){
        $('#loadingspinner').modal('hide');
    }else{
        $('#loadingspinner').on('shown.bs.modal', function (e) {
            $('#loadingspinner').modal('hide');
        })
    }
}



