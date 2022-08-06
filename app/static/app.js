$(window).on('load', function(){
    setControls();
    setCurrentWeek();
});

function setControls(){
    $("#date_start_picker").datetimepicker({
        format: 'L',
        MaxDate: moment()
    });

    $("#date_end_picker").datetimepicker({
        format: 'L',
        MaxDate: moment()
    });

    $(".period_controls").show()
   
    $("#date_start_picker").on("change.datetimepicker", function (e) {
        $('#date_end_picker').datetimepicker('minDate', e.date);
    });
    $("#date_end_picker").on("change.datetimepicker", function (e) {
        $('#date_start_picker').datetimepicker('maxDate', e.date);
    });

};

function setCurrentWeek(){
    // Order of date range important
    $("#date_end_picker").datetimepicker('date', moment());
    $("#date_start_picker").datetimepicker('date', moment().startOf('isoWeek'));

    $('#range_radio').click()
    LoadCallsData()
}

function setLastWeek(){
    $("#date_start_picker").datetimepicker('date', moment().subtract(1, 'weeks').startOf('isoWeek'));
    $("#date_end_picker").datetimepicker('date', moment().subtract(1, 'weeks').endOf('isoWeek'));

    $('#range_radio').click()
    LoadCallsData()
}

function LoadCallsData() {
    // Update data each 5 minutes
    //setTimeout(LoadCallsData, 5*1000);

    endpoint = "/_raw_data"
    var date_start = $("#date_start_picker").datetimepicker('date').format('YYYY-MM-DD 00:00:00')
    var date_end = $("#date_end_picker").datetimepicker('date').format('YYYY-MM-DD 23:59:59')

    $('#all-visits-table').bootstrapTable('removeAll')
    $('#blocked-visitors-table').bootstrapTable('removeAll')

    //Show loading spinner
    $('#loadingspinner').modal('show');

    $.getJSON($SCRIPT_ROOT + endpoint, {
        date_start: date_start,
        date_end: date_end
    }).done(function(data) {
        GenerateTableData(data)
    }).fail(function(data){
        if (data.status != 200){
            error_message = "Error " + data.status + ". " + data.statusText
            setTimeout(hideSpinnerLoading, 600)
            setTimeout(showToastr("error", error_message), 700)
        }else{
            window.location.replace("/login");
        }
    });
};

function GenerateTableData(data){
    if("all_visits" in data && "blocked_visitors" in data){
        var all_visits = data["all_visits"]
        var blocked_visitors = data["blocked_visitors"]
        updateTable(all_visits, blocked_visitors)
    }else if ("error" in data){
        error_message = "Operational error. " + data["error"]
        setTimeout(hideSpinnerLoading, 600)
        setTimeout(showToastr("error", error_message), 700)
    }
}

function updateTable(all_visits, blocked_visitors){

    var columns_all_visits = [
        {
            "field": "time",
            "title": "Date",
            "formatter": "DatetimeFormatter",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "visitorId",
            "title": "Visitor ID",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "country",
            "title": "Country",
            "formatter": "CountryFormatter",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "region",
            "title": "Region",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "city",
            "title": "City",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "incognito",
            "title": "Incognito",
            "formatter": "TrueFalseFormatter",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "os",
            "title": "OS",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "visitorBlocked",
            "title": "Status",
            "formatter": "BlockActionFormatter",
            "halign": "center",
            "align": "center",
            "sortable": false
        }
    ]

    var columns_blocked_visitors = [
        {
            "field": "blocked_at",
            "title": "Blocked At",
            "formatter": "DatetimeFormatter",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "visitorId",
            "title": "Visitor ID",
            "halign": "center",
            "align": "center",
            "sortable": true
        },
        {
            "field": "visitorBlocked",
            "title": "Status",
            "formatter": "BlockActionFormatter",
            "halign": "center",
            "align": "center",
            "sortable": false
        }
    ]


    $('#all-visits-table').bootstrapTable({
        columns: columns_all_visits,
        rowStyle: rowStyle,
        pageSize: 100,
        pageList: [100, 200, 500],
        rowAttributes: rowAttributes,
        exportDataType: "all",
        exportTypes: ['excel', 'pdf'],
        exportOptions:{
            fileName: 'call_report',
            worksheetName: 'Call Report',
            tableName: 'call_report',
            mso: {
                fileFormat: 'xlshtml',
                onMsoNumberFormat: doOnMsoNumberFormat
            }
        }
    });

    $('#all-visits-table').on('post-body.bs.table', function (e) {
        $('[data-toggle="popover"]').popover()
    })

    $('#all-visits-table').bootstrapTable('load', all_visits);


    $('#blocked-visitors-table').bootstrapTable({
        columns: columns_blocked_visitors,
        rowStyle: rowStyle,
        pageSize: 100,
        pageList: [100, 200, 500],
        rowAttributes: rowAttributes,
        exportDataType: "all",
        exportTypes: ['excel', 'pdf'],
        exportOptions:{
            fileName: 'call_report',
            worksheetName: 'Call Report',
            tableName: 'call_report',
            mso: {
                fileFormat: 'xlshtml',
                onMsoNumberFormat: doOnMsoNumberFormat
            }
        }
    });

    $('#blocked-visitors-table').on('post-body.bs.table', function (e) {
        $('[data-toggle="popover"]').popover()
    })

    $('#blocked-visitors-table').bootstrapTable('load', blocked_visitors);

    //Hide loading spinner
    setTimeout(hideSpinnerLoading, 600)
    setTimeout(showToastr("success", "Report updated"), 700)
};


function modifyVisitorStatus(visitor_id, action){

    endpoint = "/_modify_visitor"

        $.getJSON($SCRIPT_ROOT + endpoint, {
            visitor_id: visitor_id,
            action: action
        }).done(function(data) {
            if ("error" in data){
                if (data["error"] == "MODIFY_REQUEST_ALREADY_BLOCKED"){
                    toastr_type = "error"
                    toastr_message = "Visitor " + visitor_id + " ALREADY blocked!"
                }else if (data["error"] == "MODIFY_REQUEST_NOT_BLOCKED"){
                    toastr_type = "error"
                    toastr_message = "Visitor " + visitor_id + " NOT blocked!"
                }else if (data["error"] == "MODIFY_REQUEST_INVALID"){
                    toastr_type = "error"
                    toastr_message = "Invalid request for visitor " + visitor_id + " status modification!"
                }
            } else if("result" in data) {
                toastr_type = "success"
                toastr_message = "Visitor " + visitor_id + " " + action + "ed successfully!"
            }
            showToastr(toastr_type, toastr_message)
            LoadCallsData()
        }).fail(function(data){
            if (data.status != 200){
                error_message = "Error " + data.status + ". " + data.statusText
                showToastr("error", error_message)
            }else{
                window.location.replace("/login");
            }
        });
}

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

function doOnMsoNumberFormat(cell, row, col){
    var result = "";
    if (row > 0 && col == 2){
        result = "\\@";
    }
    return result;
}

function rowStyle(row, index) {
    if (row.visitorBlocked == true){
        css_class = "alert-danger"
    } else if (row.visitorBlocked == false) {
        css_class = "alert-success"
    } 

    return {
        classes: css_class,
        css: {"font-size": "11px", "padding": ".2rem", "overflow-x": "visible !important", "overflow-y": "visible !important"}
    };
}


function rowAttributes(row, index) {
    var result = {
        'data-toggle': 'popover',
        'data-placement': 'bottom',
        'data-trigger': 'hover',
        'data-html': true
    }

    if ("callback" in row && row.direction == "Incoming" && row.disposition == "MISSED") {
        result["data-content"] = [
                'Callback at: ' + row.callback.calldate,
                'By: ' + row.callback.src,
                'Before callback elapsed: ' + secondsToHms(row.callback.before_call)
            ].join('<br>')
    } else if ("missed" in row && (row.direction == "Outgoing" || row.direction == "Internal")){
        missed_calls = []
        for (call_index in row.missed){
            missed_call = [
                'Missed at: ' + row.missed[call_index].calldate,
                'By: ' + row.missed[call_index].src,
                'After call missed elapsed: ' + secondsToHms(row.missed[call_index].before_call)
            ].join('<br>')
            missed_calls.push(missed_call)
        }
        result["data-content"] = missed_calls.join('<hr>')
    }

    return result
}

function TrueFalseFormatter(value, row){
    if (value == true){
        newValue = "Yes"
    }else if(value == false){
        newValue = "No"
    }
    return newValue
}

function DatetimeFormatter(value, row){
    var utcDate = value + ".000Z"
    var localDate = moment(utcDate)
    return localDate.format('llll');
}


function CountryFormatter(value, row){
    if (typeof(row.country) != "undefined"){
        country = row.country
        country_code = row.country_code.toLowerCase();

        country_flag_icon = "<span class=\"fi fi-" + country_code +"\">"

        return '<div id="sip_id_label">' + country + ' ' + country_flag_icon +'</div>\n'
    }
}

function BlockActionFormatter(value, row){

    if (row.visitorBlocked == true){
        visitor_action_html =
            '<div class="dropdown">' +
            '  <button class="btn btn-danger btn-sm dropdown-toggle" type="button" id="dropdownMenu" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">' +
            '  <i class="fa fa-ban" aria-hidden="true"></i>' +
            '  </button>' +
            '  <div class="dropdown-menu" aria-labelledby="dropdownMenu">' +
            '    <button class="dropdown-item btn-sm" type="button" onclick="modifyVisitorStatus(\'' + row.visitorId + '\', \'unblock\')">Unblock ' + row.visitorId + '</button>' +
            '  </div>' +
            '</div>'
    }else if(row.visitorBlocked == false){
        visitor_action_html =
            '<div class="dropdown">' +
            '  <button class="btn btn-success btn-sm dropdown-toggle" type="button" id="dropdownMenu" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">' +
            '  <i class="fa fa-unlock" aria-hidden="true"></i>' +
            '  </button>' +
            '  <div class="dropdown-menu" aria-labelledby="dropdownMenu">' +
            '    <button class="dropdown-item btn-sm" type="button" onclick="modifyVisitorStatus(\'' + row.visitorId + '\', \'block\')">Block ' + row.visitorId + '</button>' +
            '  </div>' +
            '</div>'
    }
    return visitor_action_html
}


function secondsToHms(d) {
    d = Number(d);
    var h = Math.floor(d / 3600);
    var m = Math.floor(d % 3600 / 60);
    var s = Math.floor(d % 3600 % 60);

    var hDisplay = h > 0 ? h + "h:" : "";
    var mDisplay = m > 0 ? m + "m:" : "";
    var sDisplay = s + "s";
    return hDisplay + mDisplay + sDisplay;
}