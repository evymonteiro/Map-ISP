require([
  "esri/Map", 
  "esri/views/MapView", 
  "esri/layers/FeatureLayer", 
  "esri/widgets/Legend", 
  "esri/widgets/Compass", 
  "esri/widgets/ScaleBar",
  "esri/widgets/Expand"
], function(Map, MapView, FeatureLayer, Legend, Compass, ScaleBar, Expand) {

  // Camadas de feições: 
  const countiesLayer = new FeatureLayer({
      url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_Counties/FeatureServer/0"
  });

  const trafficCamerasLayer = new FeatureLayer({
      url: "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/Traffic_Cameras/FeatureServer/0"
  });
// Mapa e Visualização: 
  const map = new Map({
      basemap: "streets",
      layers: [countiesLayer, trafficCamerasLayer]
  });

  const view = new MapView({
      container: "viewDiv", 
      map: map,
      zoom: 7,
      center: [-76, 39]
  });
// Widgets, pop-ups, etc:
  const compass = new Compass({
      view: view
  });
  view.ui.add(compass, "top-left");

  const legend = new Legend({
      view: view
  });
  view.ui.add(legend, "bottom-right");
  legend.domNode.style.backgroundColor = "rgba(255, 255, 255, 0.5)";
legend.domNode.style.borderRadius = "5px";  

  const scaleBar = new ScaleBar({
      view: view,
      unit: "dual"
  });
  view.ui.add(scaleBar, "bottom-left");

  //Consultas para preencher o select:
  trafficCamerasLayer.queryFeatures({
      where: "1=1", 
      outFields: ["county"], 
      returnGeometry: false,
      groupByFieldsForStatistics: ["county"]
  }).then(function(response) {
      const counties = response.features.map(f => f.attributes.county);
      const uniqueCounties = [...new Set(counties)].sort(); 

      const selectElement = document.getElementById('countySelect');
      
      //Opções de condados:
      uniqueCounties.forEach(function(county) {
          const option = document.createElement('option');
          option.value = county;
          option.textContent = county;
          selectElement.appendChild(option);
      });

      //Todos os Condados
      const option = document.createElement('option');
      option.value = "";
      option.textContent = "Todos os Condados";
      selectElement.appendChild(option);
  });

  // Função para aplicar o filtro de condado
  function applyCountyFilter(county) {
      if (county === "") { 
          trafficCamerasLayer.definitionExpression = null;  
          trafficCamerasLayer.visible = false; 
      } else {
          trafficCamerasLayer.definitionExpression = "county = '" + county + "'";
          trafficCamerasLayer.visible = true;
      }
  // Contando pontos no polígono:
      trafficCamerasLayer.queryFeatures({
          where: county === "" ? "1=1" : "county = '" + county + "'", 
          outFields: ["county"],
          returnGeometry: false,
          groupByFieldsForStatistics: ["county"],
          outStatistics: [
              {
                  statisticType: "count",
                  onStatisticField: "county",
                  outStatisticFieldName: "camera_count"
              }
          ]
      }).then(function(response) {
          const cameraCounts = response.features.map(f => ({
              county: f.attributes.county,
              camera_count: f.attributes.camera_count
          }));
  // Intervalos:
          const cameraCountValues = cameraCounts.map(c => c.camera_count);
          const minCameraCount = Math.min(...cameraCountValues);
          const maxCameraCount = Math.max(...cameraCountValues);

          const step = (maxCameraCount - minCameraCount) / 6; //Quantidade de classes dada pela formula de Sturges


          //Usada para atribuir uma cor a cada feição com base no número de câmeras,
          //ela compara o nome do condado com a lista de câmeras e retorna a qtidade de câmeras ou 
          // "no_data".
          const arcadeExpression = 
              `var countyName = Upper(Trim($feature.NAME));  
              var cameraData = ${JSON.stringify(cameraCounts)}; 
              var cameraCount = 0;

              for (var i = 0; i < Count(cameraData); i++) {
                  if (Upper(Trim(cameraData[i].county)) == countyName) { 
                      cameraCount = cameraData[i].camera_count;
                      break;
                  }
              }
              if (cameraCount == 0) {
                  return "no_data";
              }

              return cameraCount;`;
              // funções de Upper(Trim) utilizada para lidar com Baltimore City e Baltimore County.

// Renderização: 
          const renderer = {
              type: "simple", 
              symbol: {
                  type: "simple-fill", 
                  outline: {
                      color: [0, 0, 0, 1],  
                      width: "1px"  
                  }
              },
              visualVariables: [
                  {
                      type: "color",
                      valueExpression: arcadeExpression,
                      legendOptions: {
                          title: "Número de Câmeras"
                      },
                      stops: [
                          { value: minCameraCount, color: "#FFE5E5", label: `${minCameraCount}` }, 
                          { value: minCameraCount + step * 1, color: "#FFCCCC", label: `${Math.round(minCameraCount + step * 1)}` },
                          { value: minCameraCount + step * 2, color: "#FF9999", label: `${Math.round(minCameraCount + step * 2)}` },
                          { value: minCameraCount + step * 3, color: "#FF6666", label: `${Math.round(minCameraCount + step * 3)}` },
                          { value: minCameraCount + step * 4, color: "#FF3333", label: `${Math.round(minCameraCount + step * 4)}` },
                          { value: minCameraCount + step * 5, color: "#FF0000", label: `${Math.round(minCameraCount + step * 5)}` },
                          { value: maxCameraCount, color: "#8B0000", label: `${maxCameraCount}` }, 
                          { value: "no_data", color: "#D3D3D3", label: "Sem dados" }
                      ]
                  }
              ]
          };

          countiesLayer.renderer = renderer;
          countiesLayer.refresh();
      }).catch(function(error) {
          console.error("Erro ao consultar contagem de câmeras:", error);
      });
  }

  //clicar no botão de filtro
  document.getElementById('searchButton').addEventListener('click', function() {
      const selectedCounty = document.getElementById('countySelect').value;
      applyCountyFilter(selectedCounty);
  });

  // Limpar filtro
  document.getElementById('clearButton').addEventListener('click', function() {
      const selectElement = document.getElementById('countySelect');
      selectElement.selectedIndex = 0; 
      trafficCamerasLayer.definitionExpression = null; 
      trafficCamerasLayer.visible = true; 
      countiesLayer.renderer = null; 
      countiesLayer.refresh(); 
  });
});
