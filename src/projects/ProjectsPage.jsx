import React from 'react';

import lifeGDP from '../../lifeGDP.png';
import biodiverse from '../../biodiverse.png';
import nycApart from '../../nycApart.png';

const projects = [
  {
    title: 'Life-Expectancy-to-GDP',
    subtitle: 'Python Data Analysis',
    image: lifeGDP,
    alt: 'Life expectancy vs GDP visualization',
    description:
      'What is the relationship between GDP and Life-Expectancy? Using various python libraries (pandas, matplotlib, and seaborn) and data from the WHO and the World Bank, I will seek to find that out in a visual investigation!',
    href: 'https://github.com/sumanyuj/Life-Expectancy-and-GDP-Project'
  },
  {
    title: 'Biodiversity & National Parks',
    subtitle: 'Python Data Analysis',
    image: biodiverse,
    alt: 'Biodiversity and national parks visualization',
    description:
      'Many thousands of species are at various degrees of risk across the world. By limiting our field to parks in the United States and finding patterns of the kinds of species at risk, the rate of observations for endangered and non-at-risk species alike, we can perhaps clue together what kind of species are most likley at risk, at which parks, and more!',
    href: 'https://github.com/sumanyuj/Biodiversity-Project'
  },
  {
    title: 'NYC Apartments',
    subtitle: 'Python Data Analysis',
    image: nycApart,
    alt: 'NYC apartments dataset visualization',
    description:
      'New York has one of the most expensive housing markets in the world- this much is well known. But digging beyond that, can we use the power of python and its powerful data-oriented libraries to find unique yet interesting corrleations between variables in apartment data? Using data provided from StreetEasy, I perform a visual analysis of a NYC apartment dataset to come to some interesting conclusions!',
    href: 'https://github.com/sumanyuj/NYC-Apartments-Project'
  }
];

export default function ProjectsPage() {
  return (
    <>
      <header className="container text-center mt-4">
        <h1 className="epic">
          <em>Projects</em>
        </h1>
        <p>
          <a href="index.html" className="btn">
            ← Home
          </a>
        </p>
      </header>

      <div className="container mx-auto mt-4">
        <div className="row">
          {projects.map((project) => (
            <div key={project.href} className="col-12 d-flex justify-content-center">
              <div className="card" style={{ width: '50rem' }}>
                <img src={project.image} className="card-img-top" alt={project.alt} />
                <div className="card-body">
                  <h5 className="card-title">{project.title}</h5>
                  <h6 className="card-subtitle mb-2 text-muted">{project.subtitle}</h6>
                  <p className="card-text">{project.description}</p>
                  <a
                    href={project.href}
                    className="btn"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className="fab fa-github" aria-hidden="true"></i> GitHub
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
