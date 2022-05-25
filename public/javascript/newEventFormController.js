// Set default time/date is current time/date
const today = new Date();
let time;
if (today.getHours() >= 10) {
  time = today.getHours() + ":" + today.getMinutes();
} else {
  time = "0" + today.getHours() + ":" + today.getMinutes();
}
document.getElementById("start_time").value = time;
document.getElementById("end_time").value = time;
const setMinDate = () => {
  document.getElementById("end_date").min =
    document.getElementById("start_date").value;
};

// Autocomplete location
function initMap() {
  var input = document.getElementById("searchInput");
  var autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.addListener("place_changed", function () {
    var place = autocomplete.getPlace();
    document.getElementById("address").value = JSON.stringify(
      place.address_components
    );
  });
}

// Input start Date, set today as default date
const inputStartDate = document.getElementById("start_date");
inputStartDate.min = new Date().toISOString().split("T")[0];
inputStartDate.valueAsDate = new Date();
const inputEndDate = document.getElementById("end_date");
inputEndDate.valueAsDate = new Date();

// Show/Hide location div
const locationDiv = document.getElementById("location");
const public = document.querySelectorAll(".public");
public[0].checked = "true";
const live = document.querySelectorAll(".live");
live[0].checked = "true";
const toggle_location = () => {
  if (live[1].checked) {
    locationDiv.style.display = "none";
  } else {
    locationDiv.style.display = "block";
  }
};
